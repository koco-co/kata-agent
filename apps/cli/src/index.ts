#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../../../packages/agent-runner/src/index";
import { writeArtifactInFeatureDir } from "../../../packages/artifact-repo/src/index";
import { SCHEMA_VERSION } from "../../../packages/core/src/index";
import type {
  LanhuFetchInput,
  RequirementDraft,
  RequirementSpec,
  TestSpec,
} from "../../../packages/domain/src/index";
import {
  consultKnowledge,
  listSuggestions,
  proposeKnowledge,
} from "../../../packages/knowledge-repo/src/index";
import { PluginActionRegistry } from "../../../packages/plugin-runtime/src/index";
import {
  appendTrace,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
  WorkflowExecutor,
  type WorkflowDefinition,
} from "../../../packages/workflow-engine/src/index";
import { mockFetchRequirement } from "../../../plugins/lanhu/src/mock";
import { mockExportXMind } from "../../../plugins/xmind/src/mock";

const rawArgs = Bun.argv.slice(2);
const [group, subcommand] = rawArgs;
const command =
  group === "workflow" || group === "confirmation" || group === "knowledge"
    ? `${group} ${subcommand ?? ""}`.trim()
    : group;
const args =
  group === "workflow" || group === "confirmation" || group === "knowledge"
    ? rawArgs.slice(2)
    : rawArgs.slice(1);

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireArg(name: string): string {
  const value = argValue(name);
  if (!value) {
    console.error(`Missing required argument: ${name}`);
    process.exit(1);
  }
  return value;
}

function loadWorkflowDefinition(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(process.cwd(), "workflows", "test-case-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

function agent(
  name: string,
  inputSchema: string,
  outputSchema: string,
): AgentManifest {
  return {
    name,
    title: name,
    version: "0.1.0",
    inputSchema,
    outputSchema,
    ownerSkill: "test-case-gen",
    promptPath: "prompt.md",
  };
}

function createRuntimeServices(): {
  executor: WorkflowExecutor;
} {
  const providers = new ProviderRegistry();
  providers.register(
    new MockProvider({
      "source-normalizer": JSON.stringify({
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        title: "规则配置",
        facts: [
          {
            id: "FACT-001",
            content: "用户需要创建规则。",
            sourceRefs: ["SRC-001"],
          },
        ],
      }),
      "requirement-analyst": JSON.stringify({
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        gaps: [
          {
            id: "GAP-001",
            category: "ui-copy",
            severity: "P0",
            evidence: "缺少保存按钮文案",
            impact: "影响测试断言",
            question: "保存按钮文案是什么?",
            sourceRefs: ["SRC-001"],
          },
        ],
      }),
      "clarification-drafter": JSON.stringify({
        schemaVersion: "0.1",
        summary: "需要确认保存按钮文案。",
        questions: [
          {
            id: "GAP-001",
            severity: "P0",
            category: "ui-copy",
            question: "保存按钮文案是什么?",
            impact: "影响测试断言",
            requiresProductAnswer: true,
          },
        ],
        assumptions: [],
      }),
      "requirement-author": JSON.stringify({
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        title: "规则配置",
        status: "confirmed",
        rules: [
          {
            id: "REQ-001",
            text: "保存按钮文案为保存，保存成功后展示成功提示。",
            severity: "P0",
            sourceType: "confirmation",
            sourceRefs: ["SRC-001"],
            confirmationQuestionId: "GAP-001",
          },
        ],
        pageContracts: [
          { id: "PAGE-001", name: "规则配置", surface: "web" },
        ],
        openItems: [],
        assumptions: [],
      }),
      "test-point-designer": JSON.stringify({
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        points: [
          {
            id: "TP-001",
            title: "创建规则成功提示",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            risk: "high",
          },
        ],
      }),
      "test-spec-author": JSON.stringify({
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        title: "规则配置测试规格",
        requirementRef: "requirement/spec/requirement-spec.json",
        status: "reviewed",
        modules: [
          {
            id: "M-001",
            name: "规则创建",
            requirementRefs: ["REQ-001"],
            cases: [
              {
                id: "TC-001",
                title: "创建规则后展示成功提示",
                priority: "P0",
                requirementRefs: ["REQ-001"],
                steps: [
                  {
                    id: "STEP-001",
                    action: "点击保存按钮",
                    expected: "保存成功",
                    requirementRefs: ["REQ-001"],
                  },
                ],
                assertions: [
                  {
                    id: "ASSERT-001",
                    layer: "L3",
                    kind: "ui-copy",
                    target: "成功提示",
                    expected: "保存成功",
                    requirementRefs: ["REQ-001"],
                  },
                ],
                automation: {
                  surface: "web",
                  readiness: "ready",
                  uiContractRefs: ["PAGE-001"],
                  blockers: [],
                },
                traceability: {
                  requirementRefs: ["REQ-001"],
                  sourceRefs: ["SRC-001"],
                },
              },
            ],
          },
        ],
      }),
      "test-spec-reviewer": JSON.stringify({
        schemaVersion: "0.1",
        passed: true,
        violations: [],
      }),
    }),
  );
  const actions = new PluginActionRegistry();
  actions.register("lanhu.fetchRequirement", (input) =>
    mockFetchRequirement(input as LanhuFetchInput),
  );
  actions.register("xmind.export", (input) =>
    mockExportXMind(input as TestSpec),
  );
  actions.register("knowledge.consult", (input) =>
    consultKnowledge(input as RequirementDraft),
  );
  actions.register("knowledge.propose", (input, context) =>
    proposeKnowledge(input as RequirementSpec, context.rootDir),
  );
  return {
    executor: new WorkflowExecutor({
      agentRunner: new AgentRunner(providers),
      actions,
      agents: new Map([
        [
          "source-normalizer",
          agent("source-normalizer", "RequirementSourceBundle", "RequirementDraft"),
        ],
        [
          "requirement-analyst",
          agent("requirement-analyst", "RequirementAnalysisInput", "RequirementGapReport"),
        ],
        [
          "clarification-drafter",
          agent("clarification-drafter", "RequirementGapReport", "ClarificationDossier"),
        ],
        [
          "requirement-author",
          agent("requirement-author", "RequirementAuthorInput", "RequirementSpec"),
        ],
        [
          "test-point-designer",
          agent("test-point-designer", "RequirementSpec", "TestPointSet"),
        ],
        [
          "test-spec-author",
          agent("test-spec-author", "TestSpecAuthorInput", "TestSpec"),
        ],
        [
          "test-spec-reviewer",
          agent("test-spec-reviewer", "TestSpecReviewerInput", "ReviewReport"),
        ],
      ]),
    }),
  };
}

function parseFeatureDir(featureDir: string): {
  rootDir: string;
  project: string;
  feature: string;
} {
  const resolved = resolve(featureDir);
  return {
    rootDir: dirname(dirname(dirname(dirname(resolved)))),
    project: basename(dirname(dirname(resolved))),
    feature: basename(resolved),
  };
}

if (!command || command === "help") {
  console.log(
    "kata-agent commands: test-case-gen, workflow status, workflow resume, confirmation import, knowledge suggestions",
  );
  process.exit(0);
}

if (command === "knowledge suggestions") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  console.log(JSON.stringify(listSuggestions({ rootDir, project }), null, 2));
  process.exit(0);
}

if (command === "test-case-gen") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const sourceUrl = requireArg("--source-url");
  const runId = argValue("--run") ?? randomUUID();
  const { executor } = createRuntimeServices();
  const result = await executor.start({
    location: { rootDir, project, feature },
    definition: loadWorkflowDefinition(),
    runId,
    sourceUrl,
  });
  console.log(
    JSON.stringify(
      { runId, status: result.state.status, currentNode: result.state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow status") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const state = loadWorkflowState(featureDir, runId);
  console.log(
    JSON.stringify(
      {
        runId,
        status: state.status,
        currentNode: state.currentNode,
        nodes: state.nodes,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow resume") {
  const targetFeatureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const { executor } = createRuntimeServices();
  const result = await executor.resume({
    location: parseFeatureDir(targetFeatureDir),
    definition: loadWorkflowDefinition(),
    runId,
  });
  console.log(
    JSON.stringify(
      { runId, status: result.state.status, currentNode: result.state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "confirmation import") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const file = requireArg("--file");
  const rawConfirmation = readFileSync(file, "utf8");
  const confirmation = JSON.parse(rawConfirmation) as {
    schemaVersion?: unknown;
    answers?: unknown;
  };
  if (
    // v0.1b: validate ConfirmationResult with Ajv instead of shape checks.
    confirmation.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(confirmation.answers)
  ) {
    console.error(
      "Invalid ConfirmationResult: expected schemaVersion 0.1 and answers[]",
    );
    process.exit(1);
  }
  const state = loadWorkflowState(featureDir, runId);
  const waitingNode =
    state.currentNode && state.nodes[state.currentNode]?.status === "waiting"
      ? state.currentNode
      : Object.entries(state.nodes).find(
          ([, node]) =>
            node.status === "waiting" &&
            node.waitingFor === "ConfirmationResult",
        )?.[0];
  if (!waitingNode) {
    console.error(
      `No workflow node is waiting for ConfirmationResult in run ${runId}`,
    );
    process.exit(1);
  }
  const project = argValue("--project");
  const feature = argValue("--feature");
  const ref = writeArtifactInFeatureDir(
    featureDir,
    "ConfirmationResult",
    "requirement/confirmed/confirmation-result.json",
    rawConfirmation,
    "confirmation import",
    {
      allowedScopes: ["feature.requirement.confirmed"],
      project,
      feature,
    },
  );
  saveWorkflowState(featureDir, markSucceeded(state, waitingNode));
  appendTrace(featureDir, {
    runId,
    nodeId: waitingNode,
    type: "human-import",
    artifactRefs: [ref.id],
    at: new Date().toISOString(),
  });
  console.log(`confirmation imported for ${runId}:${waitingNode}`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
