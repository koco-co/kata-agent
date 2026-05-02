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
  FlowSpec,
  RunPlan,
  RunRecord,
  SchemaName,
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
  checkArtifactConsistency,
  checkAutomationScriptReadiness,
  checkAutomationReadiness,
  checkEvidenceBinding,
  checkRequirementClarity,
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
  markBlocked,
  markFailed,
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
    const runAgent = async <T>(
      agentName: string,
      input: unknown,
    ): Promise<T> => {
      const manifest = this.services.agents.get(agentName);
      if (!manifest) throw new Error(`Agent not registered: ${agentName}`);
      const response = await this.services.agentRunner.run(manifest, input);
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
    const verifyIndexedArtifacts = (): string | undefined => {
      for (const ref of readArtifactIndex(context.location).artifacts) {
        try {
          readArtifactVerified(context.location, ref);
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }
      return undefined;
    };

    createFeatureWorkspace(context.location);
    refreshRefs();
    const artifactIntegrityError = verifyIndexedArtifacts();
    if (artifactIntegrityError) {
      const nodeId = nextRunnableNodeId();
      if (!nodeId) throw new Error(artifactIntegrityError);
      state = markFailed(state, nodeId, artifactIntegrityError, false);
      appendTrace(dir, {
        runId: context.runId,
        nodeId,
        type: "exit",
        at: new Date().toISOString(),
        message: artifactIntegrityError,
      });
      saveWorkflowState(dir, state);
      return { state };
    }
    saveWorkflowState(dir, state);

    for (const node of context.definition.nodes) {
      const nodeState = state.nodes[node.id];
      if (!nodeState) throw new Error(`Unknown workflow node in state: ${node.id}`);
      if (nodeState.status === "succeeded" || nodeState.status === "skipped") {
        continue;
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
            const output =
              (await this.services.actions.execute(
                "playwright.runPlan",
                valueFor<RunPlan>("RunPlan"),
                actionContext,
              )) as RunRecord;
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
            const htmlReport = (await this.services.actions.execute(
              node.action,
              record,
              actionContext,
            )) as HtmlReport;
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
            const output = (await this.services.actions.execute(
              node.action,
              {
                channel: "dingtalk",
                purpose: "automation-result",
                title: `Automation ${record.status}: ${record.project}/${record.feature}`,
                body: `Run ${record.runId} completed with ${bugReport.bugs.length} bug(s).`,
              },
              actionContext,
            )) as NotificationResult;
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
            const output =
              (await this.services.actions.execute(
                "lanhu.fetchRequirement",
                {
                  url: context.sourceUrl ?? "mock://poor-prd",
                  outputDir: "sources/lanhu",
                },
                actionContext,
              )) as RequirementSourceBundle;
            writtenRefs.push(
              writeJson(
                "RequirementSourceBundle",
                "sources/lanhu/requirement-source-bundle.json",
                output,
                ["feature.sources"],
              ),
            );
            const result = checkSourceIntegrity(output);
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
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "normalize-requirement-source": {
            const output = await runAgent<RequirementDraft>(
              "source-normalizer",
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
            const output =
              (await this.services.actions.execute(
                "knowledge.consult",
                valueFor<RequirementDraft>("RequirementDraft"),
                actionContext,
              )) as KnowledgeConsultResult;
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
            const output = (await this.services.actions.execute(
              node.action,
              {
                channel: "dingtalk",
                purpose: "confirmation",
                title: `需求澄清待确认: ${context.location.project}/${context.location.feature}`,
                body: markdown,
                sourceArtifactRef: draftRef.id,
              },
              actionContext,
            )) as NotificationResult;
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
            const output = await runAgent<TestSpec>("test-spec-author", input);
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
                ...checkRequirementClarity(gaps, confirmation).violations,
                ...checkTestSpecValidity(spec).violations,
                ...checkAutomationReadiness(spec, requirement).violations,
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
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "export-xmind": {
            const actionStartedAt = Date.now();
            const output =
              (await this.services.actions.execute(
                "xmind.export",
                valueFor<TestSpec>("TestSpec"),
                actionContext,
              )) as XMindExport;
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
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "propose-knowledge": {
            const output = await this.services.actions.execute(
              "knowledge.propose",
              valueFor<RequirementSpec>("RequirementSpec"),
              actionContext,
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
        state = markSucceeded(state, node.id);
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
