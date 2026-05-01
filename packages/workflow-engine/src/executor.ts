import { existsSync, readFileSync } from "node:fs";
import type {
  AgentManifest,
  AgentRunner,
} from "../../agent-runner/src/index";
import type { FeatureLocation } from "../../artifact-repo/src/index";
import {
  artifactPath,
  createFeatureWorkspace,
  featureDir,
  readArtifactIndex,
  readJsonArtifact,
  writeArtifact,
  writeJsonArtifact,
} from "../../artifact-repo/src/index";
import type {
  ArtifactRef,
  ClarificationDossier,
  ConfirmationResult,
  DesignReport,
  KnowledgeConsultResult,
  RequirementDraft,
  RequirementGapReport,
  RequirementSpec,
  RequirementSourceBundle,
  ReviewReport,
  SchemaName,
  TestPointSet,
  TestSpec,
  XMindExport,
} from "../../domain/src/index";
import type { PluginActionRegistry } from "../../plugin-runtime/src/index";
import {
  buildDesignReport,
  buildRequirementAnalysisInput,
  buildRequirementAuthorInput,
  buildTestSpecAuthorInput,
  buildTestSpecReviewerInput,
  renderConfirmationDraft,
} from "./artifact-builders";
import {
  checkAutomationReadiness,
  checkEvidenceBinding,
  checkRequirementClarity,
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

    createFeatureWorkspace(context.location);
    refreshRefs();
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
            if (!existsSync(artifactPath(context.location, output.outputPath))) {
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
            const report = buildDesignReport(
              readArtifactIndex(context.location).artifacts,
              gateResults,
              readTraceEvents(),
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
        throw error;
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
