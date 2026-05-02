import { existsSync, readFileSync, statSync } from "node:fs";
import type {
  AgentManifest,
  AgentRunner,
} from "../../agent-runner/src/index";
import type { FeatureLocation } from "../../artifact-repo/src/index";
import {
  artifactPath,
  createFeatureWorkspace,
  featureDir,
  indexExistingArtifact,
  readArtifactVerified,
  readArtifactIndex,
  readJsonArtifact,
  writeArtifact,
  writeJsonArtifact,
} from "../../artifact-repo/src/index";
import { loadRuleSet, type HardRule } from "../../core/src/index";
import type {
  ArtifactRef,
  BugReport,
  ClarificationDossier,
  ConfirmationDraft,
  ConfirmationResult,
  DesignReport,
  EvidencePack,
  KnowledgeConsultResult,
  HtmlReport,
  RequirementDraft,
  RequirementGapReport,
  RequirementSpec,
  NotificationResult,
  RequirementSourceBundle,
  ReviewReport,
  SourceRepoRef,
  FlowSpec,
  HotfixCaseGenInput,
  InspectionReport,
  IssueDraft,
  ReportGenInput,
  RunPlan,
  RunRecord,
  SchemaName,
  StaticScanInput,
  TestPointSet,
  TestSpec,
  XMindExport,
} from "../../domain/src/index";
import type { PluginActionRegistry } from "../../plugin-runtime/src/index";
import {
  buildBugReport,
  buildDesignReport,
  buildEvidencePackFromRunRecord,
  buildFlowSpecFromTestSpec,
  buildRequirementAnalysisInput,
  buildRequirementAuthorInput,
  buildRunPlanFromFlowSpec,
  buildTestSpecAuthorInput,
  buildTestSpecReviewerInput,
  renderAutomationReportMarkdown,
  renderConfirmationDraft,
  renderRequirementSpecMarkdown,
  renderTestSpecMarkdown,
} from "./artifact-builders";
import {
  buildAutomationFailureReport,
  buildConflictReport,
  buildHotfixTestSpec,
} from "./daily-qa-builders";
import {
  checkArtifactConsistency,
  checkAutomationScriptReadiness,
  checkAutomationReadiness,
  checkEvidenceBinding,
  checkRequirementClarity,
  checkRuleStoreCompliance,
  checkSourceIntegrity,
  checkTestSpecValidity,
  type GateResult,
} from "./gates";
import {
  appendTrace,
  workflowTracePath,
} from "./trace";
import {
  createRunState,
  findArtifactWriterNode,
  markBlocked,
  markFailed,
  markPendingCascade,
  markRunning,
  markSucceeded,
  markWaiting,
} from "./state";
import {
  loadWorkflowState,
  saveWorkflowState,
  workflowStatePath,
} from "./persistence";
import type { TraceEvent, WorkflowDefinition, WorkflowRunState } from "./types";

export interface WorkflowExecutorServices {
  agentRunner: AgentRunner;
  actions: PluginActionRegistry;
  agents: Map<string, AgentManifest>;
}

export interface WorkflowExecutionContext {
  location: FeatureLocation;
  definition: WorkflowDefinition;
  runId: string;
  sourceUrl?: string;
  inputs?: Record<string, string>;
  hardRules?: HardRule[];
}

export interface WorkflowExecutionResult {
  state: WorkflowRunState;
}

export class WorkflowExecutor {
  constructor(private readonly services: WorkflowExecutorServices) {}

  async start(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    return this.run(context);
  }

  async resume(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    return this.run(context);
  }

  private async run(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    const dir = featureDir(context.location);
    let state = existsSync(workflowStatePath(dir, context.runId))
      ? loadWorkflowState(dir, context.runId)
      : createRunState(context.definition, context.runId);
    const refs = new Map<string, ArtifactRef>();
    const values = new Map<string, unknown>();
    const gateResults: GateResult[] = [];

    const refreshRefs = () => {
      refs.clear();
      for (const ref of readArtifactIndex(context.location).artifacts) {
        refs.set(ref.type, ref);
      }
    };
    const remember = (ref: ArtifactRef): ArtifactRef => {
      refs.set(ref.type, ref);
      return ref;
    };
    const refFor = (type: string): ArtifactRef => {
      const ref = refs.get(type);
      if (!ref) throw new Error(`Missing artifact ref: ${type}`);
      return ref;
    };
    const inputFor = (name: string): string => {
      const value = context.inputs?.[name];
      if (!value) throw new Error(`Missing input: ${name}`);
      return value;
    };
    const refByPath = (type: string, path: string): ArtifactRef => {
      const ref = readArtifactIndex(context.location).artifacts.find(
        (item) => item.type === type && item.path === path,
      );
      if (!ref) throw new Error(`Missing ${type} artifact: ${path}`);
      return ref;
    };
    const valueFor = <T>(schemaName: SchemaName): T => {
      const existing = values.get(schemaName);
      if (existing) return existing as T;
      const value = readJsonArtifact<T>(
        context.location,
        refFor(schemaName),
        schemaName,
      );
      values.set(schemaName, value);
      return value;
    };
    const writeJson = <T>(
      schemaName: SchemaName,
      relativePath: string,
      value: T,
      allowedScopes: string[],
    ): ArtifactRef => {
      const ref = writeJsonArtifact(
        context.location,
        schemaName,
        relativePath,
        value,
        "workflow-executor",
        { allowedScopes },
      );
      remember(ref);
      values.set(schemaName, value);
      return ref;
    };
    const actionContext = {
      rootDir: context.location.rootDir,
      project: context.location.project,
      feature: context.location.feature,
    };
    const executeAction = async <T>(
      actionId: string,
      input: unknown,
      nodeId: string,
    ): Promise<T> => {
      const output = (await this.services.actions.execute(
        actionId,
        input,
        actionContext,
      )) as T;
      appendTrace(dir, {
        runId: context.runId,
        nodeId,
        type: "plugin-action",
        actionId,
        at: new Date().toISOString(),
      });
      if (actionId === "knowledge.consult" || actionId === "knowledge.propose") {
        appendTrace(dir, {
          runId: context.runId,
          nodeId,
          type:
            actionId === "knowledge.consult"
              ? "knowledge-consult"
              : "knowledge-propose",
          actionId,
          at: new Date().toISOString(),
        });
      }
      return output;
    };
    const traceArtifactWrites = (
      nodeId: string,
      artifacts: ArtifactRef[],
    ): void => {
      for (const ref of artifacts) {
        appendTrace(dir, {
          runId: context.runId,
          nodeId,
          type: "artifact-write",
          artifactRefs: [ref.id],
          at: new Date().toISOString(),
          details: { path: ref.path, artifactType: ref.type },
        });
      }
    };
    const runAgent = async <T>(
      agentName: string,
      nodeId: string,
      input: unknown,
    ): Promise<T> => {
      const manifest = this.services.agents.get(agentName);
      if (!manifest) throw new Error(`Agent not registered: ${agentName}`);
      const response = await this.services.agentRunner.run(manifest, input);
      appendTrace(dir, {
        runId: context.runId,
        nodeId,
        type: "agent-call",
        at: new Date().toISOString(),
        details: {
          agent: agentName,
          inputSchema: manifest.inputSchema,
          outputSchema: manifest.outputSchema,
        },
      });
      appendTrace(dir, {
        runId: context.runId,
        nodeId,
        type: "provider-call",
        at: new Date().toISOString(),
        providerUsage: {
          providerId: response.providerId,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          durationMs: response.usage.durationMs,
          cost: response.usage.cost,
        },
      });
      if (typeof response.usage.cost === "number") {
        appendTrace(dir, {
          runId: context.runId,
          nodeId,
          type: "provider-cost-summary",
          at: new Date().toISOString(),
          providerUsage: {
            providerId: response.providerId,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            durationMs: response.usage.durationMs,
            cost: response.usage.cost,
          },
        });
      }
      return response.output as T;
    };
    const readTraceEvents = (): TraceEvent[] => {
      const path = workflowTracePath(dir, context.runId);
      if (!existsSync(path)) return [];
      return readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TraceEvent);
    };
    const nextRunnableNodeId = (): string | undefined =>
      context.definition.nodes.find((node) => {
        const status = state.nodes[node.id]?.status;
        return status !== "succeeded" && status !== "skipped";
      })?.id ?? context.definition.nodes[0]?.id;
    const verifyIndexedArtifacts = ():
      | { ref: ArtifactRef; message: string }
      | undefined => {
      for (const ref of readArtifactIndex(context.location).artifacts) {
        try {
          readArtifactVerified(context.location, ref);
        } catch (error) {
          return {
            ref,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return undefined;
    };
    const rawFileContents = (
      source: RequirementSourceBundle,
    ): Record<string, string | Uint8Array> => {
      const contents: Record<string, string | Uint8Array> = {};
      for (const rawFile of source.rawFiles) {
        const path = artifactPath(context.location, rawFile.path);
        if (existsSync(path)) contents[rawFile.path] = readFileSync(path);
      }
      return contents;
    };
    const markdownConsistencyArtifacts = ():
      | Array<{
          id: string;
          path: string;
          expected: string;
          actual: string;
        }>
      | undefined => {
      const index = readArtifactIndex(context.location);
      const artifacts: Array<{
        id: string;
        path: string;
        expected: string;
        actual: string;
      }> = [];
      const testSpecMarkdown = index.artifacts.find(
        (item) => item.type === "TestSpecMarkdown",
      );
      if (testSpecMarkdown) {
        artifacts.push({
          id: "test-spec-markdown",
          path: testSpecMarkdown.path,
          expected: renderTestSpecMarkdown(valueFor<TestSpec>("TestSpec")),
          actual: readFileSync(
            artifactPath(context.location, testSpecMarkdown.path),
            "utf8",
          ),
        });
      }
      const requirementMarkdown = index.artifacts.find(
        (item) => item.type === "RequirementSpecMarkdown",
      );
      if (requirementMarkdown && refs.has("RequirementSpec")) {
        artifacts.push({
          id: "requirement-spec-markdown",
          path: requirementMarkdown.path,
          expected: renderRequirementSpecMarkdown(
            valueFor<RequirementSpec>("RequirementSpec"),
          ),
          actual: readFileSync(
            artifactPath(context.location, requirementMarkdown.path),
            "utf8",
          ),
        });
      }
      return artifacts.length > 0 ? artifacts : undefined;
    };
    const hardRules = () =>
      loadRuleSet({
        rootDir: context.location.rootDir,
        project: context.location.project,
        runRules: context.hardRules,
      }).rules;

    createFeatureWorkspace(context.location);
    refreshRefs();
    const artifactIntegrityError = verifyIndexedArtifacts();
    if (artifactIntegrityError) {
      const writerNode = findArtifactWriterNode(
        state,
        artifactIntegrityError.ref.id,
      );
      if (writerNode) {
        state = markPendingCascade(state, context.definition, writerNode);
        appendTrace(dir, {
          runId: context.runId,
          nodeId: writerNode,
          type: "exit",
          at: new Date().toISOString(),
          message: artifactIntegrityError.message,
        });
        saveWorkflowState(dir, state);
        refreshRefs();
      } else {
        const nodeId = nextRunnableNodeId();
        if (!nodeId) throw new Error(artifactIntegrityError.message);
        state = markFailed(
          state,
          nodeId,
          artifactIntegrityError.message,
          false,
        );
        appendTrace(dir, {
          runId: context.runId,
          nodeId,
          type: "exit",
          at: new Date().toISOString(),
          message: artifactIntegrityError.message,
        });
        saveWorkflowState(dir, state);
        return { state };
      }
    }
    saveWorkflowState(dir, state);

    for (const node of context.definition.nodes) {
      const nodeState = state.nodes[node.id];
      if (!nodeState) throw new Error(`Unknown workflow node in state: ${node.id}`);
      if (nodeState.status === "succeeded" || nodeState.status === "skipped") {
        continue;
      }
      if (nodeState.status === "failed" && nodeState.retryable !== true) {
        state = { ...state, status: "failed", currentNode: node.id };
        saveWorkflowState(dir, state);
        return { state };
      }
      if (nodeState.status === "blocked" || nodeState.status === "cancelled") {
        state = {
          ...state,
          status: nodeState.status === "blocked" ? "blocked" : "cancelled",
          currentNode: node.id,
        };
        saveWorkflowState(dir, state);
        return { state };
      }
      if (nodeState.status === "waiting") {
        state = { ...state, status: "waiting", currentNode: node.id };
        saveWorkflowState(dir, state);
        return { state };
      }
      const dependencies = node.dependsOn ?? [];
      const ready = dependencies.every(
        (dependency) => state.nodes[dependency]?.status === "succeeded",
      );
      if (!ready) continue;

      state = markRunning(state, node.id);
      saveWorkflowState(dir, state);
      appendTrace(dir, {
        runId: context.runId,
        nodeId: node.id,
        type: "enter",
        actionId: node.action,
        gateId: node.gate,
        at: new Date().toISOString(),
      });

      const writtenRefs: ArtifactRef[] = [];
      if (node.type === "human") {
        state = markWaiting(state, node.id, "ConfirmationResult");
        appendTrace(dir, {
          runId: context.runId,
          nodeId: node.id,
          type: "exit",
          at: new Date().toISOString(),
          message: "waiting for ConfirmationResult",
        });
        saveWorkflowState(dir, state);
        return { state };
      }

      try {
        switch (node.id) {
          case "create-feature-workspace": {
            createFeatureWorkspace(context.location);
            break;
          }
          case "create-automation-workspace": {
            createFeatureWorkspace(context.location);
            break;
          }
          case "static-scan": {
            const sourceRepo: SourceRepoRef = {
              schemaVersion: "0.1",
              repoId: inputFor("repoId"),
              sourceRoot: inputFor("sourceRoot"),
              readOnly: true,
            };
            const sourceRepoRef = writeJson(
              "SourceRepoRef",
              "reports/static-scan/source-repo-ref.json",
              sourceRepo,
              ["feature.reports"],
            );
            writtenRefs.push(sourceRepoRef);
            const input: StaticScanInput = {
              schemaVersion: "0.1",
              project: context.location.project,
              feature: context.location.feature,
              sourceRepoRef: sourceRepoRef.id,
              diffText: inputFor("diffText"),
            };
            writtenRefs.push(
              writeJson(
                "StaticScanInput",
                "reports/static-scan/static-scan-input.json",
                input,
                ["feature.reports"],
              ),
            );
            const report = await executeAction<InspectionReport>(
              "staticScan.scanDiff",
              input,
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "InspectionReport",
                "reports/static-scan/inspection-report.json",
                report,
                ["feature.reports"],
              ),
            );
            break;
          }
          case "generate-reports": {
            const runRecordRef = refByPath("RunRecord", inputFor("runRecordPath"));
            const evidencePackRef = refByPath(
              "EvidencePack",
              inputFor("evidencePackPath"),
            );
            const reviewReportRef = refByPath(
              "ReviewReport",
              inputFor("reviewReportPath"),
            );
            const input: ReportGenInput = {
              schemaVersion: "0.1",
              project: context.location.project,
              feature: context.location.feature,
              runRecordRef: runRecordRef.id,
              evidencePackRef: evidencePackRef.id,
              reviewReportRef: reviewReportRef.id,
            };
            writtenRefs.push(
              writeJson(
                "ReportGenInput",
                "reports/report-gen-input.json",
                input,
                ["feature.reports"],
              ),
            );
            const runRecord = readJsonArtifact<RunRecord>(
              context.location,
              runRecordRef,
              "RunRecord",
            );
            const evidencePack = readJsonArtifact<EvidencePack>(
              context.location,
              evidencePackRef,
              "EvidencePack",
            );
            if (evidencePack.runRecordRef !== runRecordRef.id) {
              throw new Error(
                `EvidencePack does not reference RunRecord: ${evidencePack.runRecordRef} !== ${runRecordRef.id}`,
              );
            }
            const reviewReport = readJsonArtifact<ReviewReport>(
              context.location,
              reviewReportRef,
              "ReviewReport",
            );
            writtenRefs.push(
              writeJson(
                "BugReport",
                "reports/bug-report.json",
                buildBugReport(runRecord, evidencePack),
                ["feature.reports"],
              ),
            );
            writtenRefs.push(
              writeJson(
                "AutomationFailureReport",
                "reports/automation-failure-report.json",
                buildAutomationFailureReport(runRecordRef.id, runRecord),
                ["feature.reports"],
              ),
            );
            writtenRefs.push(
              writeJson(
                "ConflictReport",
                "reports/conflict-report.json",
                buildConflictReport(
                  reviewReportRef.id,
                  context.location.project,
                  context.location.feature,
                  reviewReport,
                ),
                ["feature.reports"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "AutomationReportMarkdown",
                  "reports/automation-report.md",
                  renderAutomationReportMarkdown(runRecord),
                  "workflow-executor",
                  { allowedScopes: ["feature.reports"] },
                ),
              ),
            );
            break;
          }
          case "generate-hotfix-test-spec": {
            const issueDraftRef = refByPath(
              "IssueDraft",
              inputFor("issueDraftPath"),
            );
            const sourceRepoRef = refByPath(
              "SourceRepoRef",
              inputFor("sourceRepoPath"),
            );
            const input: HotfixCaseGenInput = {
              schemaVersion: "0.1",
              project: context.location.project,
              feature: context.location.feature,
              issueDraftRef: issueDraftRef.id,
              sourceRepoRef: sourceRepoRef.id,
            };
            writtenRefs.push(
              writeJson(
                "HotfixCaseGenInput",
                "reports/hotfix-case-gen-input.json",
                input,
                ["feature.reports"],
              ),
            );
            const issueDraft = readJsonArtifact<IssueDraft>(
              context.location,
              issueDraftRef,
              "IssueDraft",
            );
            const sourceRepo = readJsonArtifact<SourceRepoRef>(
              context.location,
              sourceRepoRef,
              "SourceRepoRef",
            );
            const testSpec = buildHotfixTestSpec(
              issueDraftRef.id,
              issueDraft,
              sourceRepo,
            );
            writtenRefs.push(
              writeJson(
                "TestSpec",
                "test-spec/hotfix-test-spec.json",
                testSpec,
                ["feature.test-spec"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "TestSpecMarkdown",
                  "test-spec/hotfix-test-spec.md",
                  renderTestSpecMarkdown(testSpec),
                  "workflow-executor",
                  { allowedScopes: ["feature.test-spec"] },
                ),
              ),
            );
            break;
          }
          case "load-test-spec": {
            const path = context.inputs?.testSpecPath;
            if (!path) throw new Error("Missing input: testSpecPath");
            const indexRef = readArtifactIndex(context.location).artifacts.find(
              (item) => item.type === "TestSpec" && item.path === path,
            );
            if (!indexRef) throw new Error(`Missing TestSpec artifact: ${path}`);
            remember(indexRef);
            values.set(
              "TestSpec",
              readJsonArtifact<TestSpec>(context.location, indexRef, "TestSpec"),
            );
            break;
          }
          case "build-flow-spec": {
            const output = buildFlowSpecFromTestSpec(
              refFor("TestSpec"),
              valueFor<TestSpec>("TestSpec"),
            );
            writtenRefs.push(
              writeJson(
                "FlowSpec",
                "automation/flow-spec.json",
                output,
                ["feature.automation"],
              ),
            );
            break;
          }
          case "gate-automation-script-readiness": {
            const result = checkAutomationScriptReadiness(
              valueFor<TestSpec>("TestSpec"),
            );
            gateResults.push(result);
            appendTrace(dir, {
              runId: context.runId,
              nodeId: node.id,
              type: result.passed ? "gate-passed" : "gate-failed",
              gateId: result.gateId,
              at: new Date().toISOString(),
              details: { violations: result.violations },
            });
            if (!result.passed) {
              state = markBlocked(
                state,
                node.id,
                result.gateId ?? "automation-script-readiness",
              );
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "build-run-plan": {
            const mode = context.inputs?.mode ?? "mock";
            if (mode !== "mock" && mode !== "real") {
              throw new Error("Invalid input: mode");
            }
            const rendered = buildRunPlanFromFlowSpec(
              refFor("FlowSpec"),
              valueFor<FlowSpec>("FlowSpec"),
              mode,
            );
            writtenRefs.push(
              writeJson(
                "RunPlan",
                "automation/playwright/run-plan.json",
                rendered.plan,
                ["feature.automation"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "PlaywrightScript",
                  rendered.plan.scriptPath,
                  rendered.script,
                  "workflow-executor",
                  { allowedScopes: ["feature.automation"] },
                ),
              ),
            );
            break;
          }
          case "execute-run-plan": {
            const output = await executeAction<RunRecord>(
              "playwright.runPlan",
              valueFor<RunPlan>("RunPlan"),
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "RunRecord",
                "automation/run-record.json",
                output,
                ["feature.automation"],
              ),
            );
            if (output.status === "failed") {
              const message = `Playwright run failed: ${output.runId}`;
              state = markFailed(state, node.id, message);
              traceArtifactWrites(node.id, writtenRefs);
              appendTrace(dir, {
                runId: context.runId,
                nodeId: node.id,
                type: "exit",
                actionId: node.action,
                gateId: node.gate,
                artifactRefs: writtenRefs.map((ref) => ref.id),
                at: new Date().toISOString(),
                message,
              });
              saveWorkflowState(dir, state);
              return { state };
            }
            if (output.status === "blocked") {
              const message = `Playwright run blocked: ${output.runId}`;
              state = markBlocked(state, node.id, message);
              traceArtifactWrites(node.id, writtenRefs);
              appendTrace(dir, {
                runId: context.runId,
                nodeId: node.id,
                type: "exit",
                actionId: node.action,
                gateId: node.gate,
                artifactRefs: writtenRefs.map((ref) => ref.id),
                at: new Date().toISOString(),
                message,
              });
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "collect-evidence": {
            const output = buildEvidencePackFromRunRecord(
              refFor("RunRecord"),
              valueFor<RunRecord>("RunRecord"),
            );
            writtenRefs.push(
              writeJson(
                "EvidencePack",
                "automation/evidence-pack.json",
                output,
                ["feature.automation"],
              ),
            );
            break;
          }
          case "bug-report": {
            if (!node.action) throw new Error("Missing action: bug-report");
            const record = valueFor<RunRecord>("RunRecord");
            const evidence = valueFor<EvidencePack>("EvidencePack");
            const output = buildBugReport(record, evidence);
            writtenRefs.push(
              writeJson("BugReport", "reports/bug-report.json", output, [
                "feature.reports",
              ]),
            );
            const htmlReport = await executeAction<HtmlReport>(
              node.action,
              record,
              node.id,
            );
            writtenRefs.push(
              writeJson("HtmlReport", "reports/html-report.json", htmlReport, [
                "feature.reports",
              ]),
            );
            break;
          }
          case "notify-run-complete": {
            if (!node.action) {
              throw new Error("Missing action: notify-run-complete");
            }
            const record = valueFor<RunRecord>("RunRecord");
            const bugReport = valueFor<BugReport>("BugReport");
            const output = await executeAction<NotificationResult>(
              node.action,
              {
                channel: "dingtalk",
                purpose: "automation-result",
                title: `Automation ${record.status}: ${record.project}/${record.feature}`,
                body: `Run ${record.runId} completed with ${bugReport.bugs.length} bug(s).`,
              },
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "NotificationResult",
                "reports/notification-result.json",
                output,
                ["feature.reports"],
              ),
            );
            break;
          }
          case "write-automation-report": {
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "AutomationReportMarkdown",
                  "reports/automation-report.md",
                  renderAutomationReportMarkdown(valueFor<RunRecord>("RunRecord")),
                  "workflow-executor",
                  { allowedScopes: ["feature.reports"] },
                ),
              ),
            );
            break;
          }
          case "ingest-requirement-source": {
            const output = await executeAction<RequirementSourceBundle>(
              "lanhu.fetchRequirement",
              {
                url: context.sourceUrl ?? "mock://poor-prd",
                outputDir: "sources/lanhu",
              },
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "RequirementSourceBundle",
                "sources/lanhu/requirement-source-bundle.json",
                output,
                ["feature.sources"],
              ),
            );
            const result = checkSourceIntegrity(output, {
              rawFileContents: rawFileContents(output),
            });
            gateResults.push(result);
            appendTrace(dir, {
              runId: context.runId,
              nodeId: node.id,
              type: result.passed ? "gate-passed" : "gate-failed",
              gateId: result.gateId,
              at: new Date().toISOString(),
              details: { violations: result.violations },
            });
            if (!result.passed) {
              state = markBlocked(state, node.id, "source-integrity");
              traceArtifactWrites(node.id, writtenRefs);
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "normalize-requirement-source": {
            const output = await runAgent<RequirementDraft>(
              "source-normalizer",
              node.id,
              valueFor<RequirementSourceBundle>("RequirementSourceBundle"),
            );
            writtenRefs.push(
              writeJson(
                "RequirementDraft",
                "requirement/drafts/requirement-draft.json",
                output,
                ["feature.requirement.drafts"],
              ),
            );
            break;
          }
          case "consult-knowledge": {
            const output = await executeAction<KnowledgeConsultResult>(
              "knowledge.consult",
              valueFor<RequirementDraft>("RequirementDraft"),
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "KnowledgeConsultResult",
                "requirement/drafts/knowledge-consult-result.json",
                output,
                ["feature.requirement.drafts"],
              ),
            );
            break;
          }
          case "analyze-requirement-gaps": {
            const input = buildRequirementAnalysisInput(
              refFor("RequirementDraft"),
              refFor("KnowledgeConsultResult"),
            );
            const output = await runAgent<RequirementGapReport>(
              "requirement-analyst",
              node.id,
              input,
            );
            writtenRefs.push(
              writeJson(
                "RequirementGapReport",
                "requirement/clarifications/requirement-gap-report.json",
                output,
                ["feature.requirement.clarif"],
              ),
            );
            break;
          }
          case "draft-clarification-dossier": {
            const output = await runAgent<ClarificationDossier>(
              "clarification-drafter",
              node.id,
              valueFor<RequirementGapReport>("RequirementGapReport"),
            );
            writtenRefs.push(
              writeJson(
                "ClarificationDossier",
                "requirement/clarifications/clarification-dossier.json",
                output,
                ["feature.requirement.clarif"],
              ),
            );
            break;
          }
          case "render-confirmation-draft": {
            const rendered = renderConfirmationDraft(
              refFor("ClarificationDossier"),
              valueFor<ClarificationDossier>("ClarificationDossier"),
            );
            writtenRefs.push(
              writeJson(
                "ConfirmationDraft",
                "requirement/clarifications/confirmation-draft.json",
                rendered.draft,
                ["feature.requirement.clarif"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "ConfirmationDraftMarkdown",
                  "requirement/clarifications/confirmation-draft.md",
                  rendered.markdown,
                  "workflow-executor",
                  { allowedScopes: ["feature.requirement.clarif"] },
                ),
              ),
            );
            break;
          }
          case "send-confirmation-notification": {
            if (!node.action) {
              throw new Error("Missing action: send-confirmation-notification");
            }
            const draftRef = refFor("ConfirmationDraft");
            const markdownRef = readArtifactIndex(
              context.location,
            ).artifacts.find(
              (item) => item.type === "ConfirmationDraftMarkdown",
            );
            const markdown = markdownRef
              ? readArtifactVerified(context.location, markdownRef)
              : `Confirmation draft: ${valueFor<ConfirmationDraft>("ConfirmationDraft").renderedMarkdownPath}`;
            const output = await executeAction<NotificationResult>(
              node.action,
              {
                channel: "dingtalk",
                purpose: "confirmation",
                title: `需求澄清待确认: ${context.location.project}/${context.location.feature}`,
                body: markdown,
                sourceArtifactRef: draftRef.id,
              },
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "NotificationResult",
                "requirement/clarifications/confirmation-notification-result.json",
                output,
                ["feature.requirement.clarif"],
              ),
            );
            break;
          }
          case "author-requirement-spec": {
            const input = buildRequirementAuthorInput(
              refFor("RequirementDraft"),
              refFor("RequirementGapReport"),
              refFor("ClarificationDossier"),
              refFor("ConfirmationResult"),
            );
            const output = await runAgent<RequirementSpec>(
              "requirement-author",
              node.id,
              input,
            );
            writtenRefs.push(
              writeJson(
                "RequirementSpec",
                "requirement/spec/requirement-spec.json",
                output,
                ["feature.requirement.spec"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "RequirementSpecMarkdown",
                  "requirement/spec/requirement-spec.md",
                  renderRequirementSpecMarkdown(output),
                  "workflow-executor",
                  { allowedScopes: ["feature.requirement.spec"] },
                ),
              ),
            );
            break;
          }
          case "design-test-points": {
            const output = await runAgent<TestPointSet>(
              "test-point-designer",
              node.id,
              valueFor<RequirementSpec>("RequirementSpec"),
            );
            writtenRefs.push(
              writeJson(
                "TestPointSet",
                "test-spec/test-points.json",
                output,
                ["feature.test-spec"],
              ),
            );
            break;
          }
          case "author-test-spec": {
            const input = buildTestSpecAuthorInput(
              refFor("TestPointSet"),
              refFor("RequirementSpec"),
            );
            const output = await runAgent<TestSpec>(
              "test-spec-author",
              node.id,
              input,
            );
            writtenRefs.push(
              writeJson(
                "TestSpec",
                "test-spec/test-spec.json",
                output,
                ["feature.test-spec"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "TestSpecMarkdown",
                  "test-spec/test-spec.md",
                  renderTestSpecMarkdown(output),
                  "workflow-executor",
                  { allowedScopes: ["feature.test-spec"] },
                ),
              ),
            );
            break;
          }
          case "review-test-spec": {
            const input = buildTestSpecReviewerInput(
              refFor("TestSpec"),
              refFor("RequirementSpec"),
            );
            const output = await runAgent<ReviewReport>(
              "test-spec-reviewer",
              node.id,
              input,
            );
            writtenRefs.push(
              writeJson(
                "ReviewReport",
                "test-spec/review-report.json",
                output,
                ["feature.test-spec"],
              ),
            );
            break;
          }
          case "gate-readiness": {
            const requirement = valueFor<RequirementSpec>("RequirementSpec");
            const spec = valueFor<TestSpec>("TestSpec");
            const gaps = valueFor<RequirementGapReport>("RequirementGapReport");
            const confirmation =
              valueFor<ConfirmationResult>("ConfirmationResult");
            const result: GateResult = {
              gateId: "requirement-test-readiness",
              passed: true,
              violations: [
                ...checkEvidenceBinding(requirement).violations,
                ...checkRequirementClarity(gaps, confirmation, requirement)
                  .violations,
                ...checkTestSpecValidity(spec).violations,
                ...checkAutomationReadiness(spec, requirement).violations,
                ...checkRuleStoreCompliance(hardRules()).violations,
              ],
            };
            result.passed = result.violations.every(
              (violation) => violation.severity !== "error",
            );
            gateResults.push(result);
            appendTrace(dir, {
              runId: context.runId,
              nodeId: node.id,
              type: result.passed ? "gate-passed" : "gate-failed",
              gateId: result.gateId,
              at: new Date().toISOString(),
              details: { violations: result.violations },
            });
            if (!result.passed) {
              state = markBlocked(state, node.id, "requirement-test-readiness");
              traceArtifactWrites(node.id, writtenRefs);
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "export-xmind": {
            const actionStartedAt = Date.now();
            const output = await executeAction<XMindExport>(
              "xmind.export",
              valueFor<TestSpec>("TestSpec"),
              node.id,
            );
            writtenRefs.push(
              writeJson(
                "XMindExport",
                "exports/xmind/xmind-export.json",
                output,
                ["feature.exports"],
              ),
            );
            const xmindPath = artifactPath(context.location, output.outputPath);
            const actionCreatedXMind =
              existsSync(xmindPath) &&
              statSync(xmindPath).mtimeMs >= actionStartedAt;
            if (!actionCreatedXMind) {
              writtenRefs.push(
                remember(
                  writeArtifact(
                    context.location,
                    "XMindMockFile",
                    output.outputPath,
                    `mock xmind export: ${output.caseCount} cases\n`,
                    "workflow-executor",
                    { allowedScopes: ["feature.exports"] },
                  ),
                ),
              );
            } else {
              writtenRefs.push(
                remember(
                  indexExistingArtifact(
                    context.location,
                    "XMindFile",
                    output.outputPath,
                    "workflow-executor",
                    { allowedScopes: ["feature.exports"] },
                  ),
                ),
              );
            }
            break;
          }
          case "gate-artifact-consistency": {
            const result = checkArtifactConsistency(
              valueFor<TestSpec>("TestSpec"),
              valueFor<XMindExport>("XMindExport"),
              { markdownArtifacts: markdownConsistencyArtifacts() },
            );
            gateResults.push(result);
            appendTrace(dir, {
              runId: context.runId,
              nodeId: node.id,
              type: result.passed ? "gate-passed" : "gate-failed",
              gateId: result.gateId,
              at: new Date().toISOString(),
              details: { violations: result.violations },
            });
            if (!result.passed) {
              state = markBlocked(state, node.id, "artifact-consistency");
              traceArtifactWrites(node.id, writtenRefs);
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "propose-knowledge": {
            const output = await executeAction<unknown>(
              "knowledge.propose",
              valueFor<RequirementSpec>("RequirementSpec"),
              node.id,
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "KnowledgeSuggestion[]",
                  "reports/knowledge-suggestions.json",
                  `${JSON.stringify(output, null, 2)}\n`,
                  "workflow-executor",
                  { allowedScopes: ["feature.reports"] },
                ),
              ),
            );
            break;
          }
          case "write-design-report": {
            const traceEvents = readTraceEvents();
            const report = buildDesignReport(
              readArtifactIndex(context.location).artifacts,
              mergeGateResults(gateResults, traceGateResults(traceEvents)),
              traceEvents,
            );
            writtenRefs.push(
              writeJson("DesignReport", "reports/design-report.json", report, [
                "feature.reports",
              ]),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "DesignReportMarkdown",
                  "reports/design-report.md",
                  renderDesignReportMarkdown(report),
                  "workflow-executor",
                  { allowedScopes: ["feature.reports"] },
                ),
              ),
            );
            break;
          }
          default:
            throw new Error(`Unsupported workflow node: ${node.id}`);
        }
        traceArtifactWrites(node.id, writtenRefs);
        state = markSucceeded(
          state,
          node.id,
          writtenRefs.map((ref) => ref.id),
        );
        appendTrace(dir, {
          runId: context.runId,
          nodeId: node.id,
          type: "exit",
          actionId: node.action,
          gateId: node.gate,
          artifactRefs: writtenRefs.map((ref) => ref.id),
          at: new Date().toISOString(),
        });
        saveWorkflowState(dir, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state = markFailed(
          state,
          node.id,
          message,
          message.includes("TRANSIENT") || message.includes("429"),
        );
        appendTrace(dir, {
          runId: context.runId,
          nodeId: node.id,
          type: "exit",
          actionId: node.action,
          gateId: node.gate,
          at: new Date().toISOString(),
          message,
        });
        saveWorkflowState(dir, state);
        return { state };
      }
    }

    saveWorkflowState(dir, state);
    return { state };
  }
}

function renderDesignReportMarkdown(report: DesignReport): string {
  const lines = [
    "# Design Report",
    "",
    report.summary,
    "",
    "## Artifacts",
    ...report.artifactRefs.map((ref) => `- ${ref}`),
    "",
    "## Gates",
    ...report.gateResults.map(
      (gate) => `- ${gate.gateId}: ${gate.passed ? "passed" : "failed"}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function traceGateResults(traceEvents: TraceEvent[]): GateResult[] {
  const results: GateResult[] = [];
  for (const event of traceEvents) {
    if (event.type !== "gate-passed" && event.type !== "gate-failed") continue;
    const violations = event.details?.violations;
    results.push({
      gateId: event.gateId,
      passed: event.type === "gate-passed",
      violations: Array.isArray(violations)
        ? violations.filter(isGateViolation)
        : [],
    });
  }
  return results;
}

function mergeGateResults(
  current: GateResult[],
  fromTrace: GateResult[],
): GateResult[] {
  const merged = new Map<string, GateResult>();
  for (const result of fromTrace) {
    merged.set(gateResultKey(result), result);
  }
  for (const result of current) {
    merged.set(gateResultKey(result), result);
  }
  return [...merged.values()];
}

function gateResultKey(result: GateResult): string {
  return result.gateId ?? JSON.stringify(result);
}

function isGateViolation(value: unknown): value is GateResult["violations"][number] {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.severity === "error" || item.severity === "warning") &&
    typeof item.message === "string"
  );
}
