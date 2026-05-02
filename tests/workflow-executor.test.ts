import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../packages/agent-runner/src/index";
import {
  artifactPath,
  createFeatureWorkspace,
  featureDir,
  readArtifactIndex,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type {
  LanhuFetchInput,
  TestSpec,
  XMindExport,
} from "../packages/domain/src/index";
import { consultKnowledge } from "../packages/knowledge-repo/src/index";
import { PluginActionRegistry } from "../packages/plugin-runtime/src/index";
import {
  appendTrace,
  createRunState,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
  WorkflowExecutor,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";
import { mockFetchRequirement } from "../plugins/lanhu/src/mock";
import { sendNotification } from "../plugins/notify/src/mock";

const roots: string[] = [];
const repoRoot = join(import.meta.dir, "..");

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

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

function loadWorkflow(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(repoRoot, "workflows", "test-case-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

function smallTestSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "Rule Config Test Spec",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "module-rules",
        name: "Rules",
        requirementRefs: ["REQ-1"],
        cases: [
          {
            id: "case-save-rule",
            title: "Save a rule",
            priority: "P0",
            requirementRefs: ["REQ-1"],
            steps: [],
            assertions: [],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: [],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-1"],
              sourceRefs: ["SRC-1"],
            },
          },
        ],
      },
    ],
  };
}

function writeTestSpec(location: {
  rootDir: string;
  project: string;
  feature: string;
}): void {
  writeJsonArtifact(
    location,
    "TestSpec",
    "test-spec/test-spec.json",
    smallTestSpec(),
    "test",
    { allowedScopes: ["feature.test-spec"] },
  );
}

const xmindOnlyWorkflow: WorkflowDefinition = {
  id: "xmind-only",
  version: "0.1",
  skill: "test-case-gen",
  nodes: [{ id: "export-xmind", type: "tool", action: "xmind.export" }],
};

const xmindWithConsistencyWorkflow: WorkflowDefinition = {
  id: "xmind-with-consistency",
  version: "0.1",
  skill: "test-case-gen",
  nodes: [
    { id: "export-xmind", type: "tool", action: "xmind.export" },
    {
      id: "gate-artifact-consistency",
      type: "gate",
      gate: "artifact-consistency",
      dependsOn: ["export-xmind"],
    },
  ],
};

const designReportAfterGateWorkflow: WorkflowDefinition = {
  id: "design-report-after-gate",
  version: "0.1",
  skill: "test-case-gen",
  nodes: [
    { id: "gate-readiness", type: "gate", gate: "requirement-test-readiness" },
    {
      id: "write-design-report",
      type: "artifact",
      dependsOn: ["gate-readiness"],
    },
  ],
};

describe("workflow executor", () => {
  test("runs deterministic workflow until human confirmation waits", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };

    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(
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
              impact: "影响断言",
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
              impact: "影响断言",
              requiresProductAnswer: true,
            },
          ],
          assumptions: [],
        }),
      }),
    );
    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", (input) =>
      mockFetchRequirement(input as LanhuFetchInput),
    );
    actions.register("knowledge.consult", (input) => consultKnowledge(input as any));
    actions.register("notify.sendNotification", (input) =>
      sendNotification(input as any),
    );

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(providerRegistry),
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
      ]),
    });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "run-1",
      sourceUrl: "mock://poor-prd",
    });

    const dir = featureDir(location);
    expect(result.state.status).toBe("waiting");
    expect(result.state.currentNode).toBe("await-confirmation-result");
    expect(loadWorkflowState(dir, "run-1").status).toBe("waiting");
    expect(
      existsSync(
        join(
          dir,
          "requirement",
          "clarifications",
          "confirmation-draft.md",
        ),
      ),
    ).toBe(true);
    expect(readFileSync(join(dir, "traces", "run-1.jsonl"), "utf8")).toContain(
      '"nodeId":"await-confirmation-result"',
    );
    const trace = readFileSync(join(dir, "traces", "run-1.jsonl"), "utf8");
    expect(trace).toContain('"type":"plugin-action"');
    expect(trace).toContain('"actionId":"lanhu.fetchRequirement"');
    expect(trace).toContain('"type":"agent-call"');
    expect(trace).toContain('"type":"provider-call"');
    expect(trace).toContain('"type":"artifact-write"');
    expect(trace).toContain('"type":"knowledge-consult"');
  });

  test("traces knowledge proposal events", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "RequirementSpec",
      "requirement/spec/requirement-spec.json",
      {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        title: "规则配置",
        status: "confirmed",
        rules: [
          {
            id: "REQ-001",
            text: "保存成功后展示成功提示。",
            severity: "P0",
            sourceType: "confirmation",
            sourceRefs: ["SRC-001"],
            confirmationQuestionId: "GAP-001",
          },
        ],
        pageContracts: [],
        openItems: [],
        assumptions: [],
      },
      "test",
      { allowedScopes: ["feature.requirement.spec"] },
    );
    const actions = new PluginActionRegistry();
    actions.register("knowledge.propose", () => []);
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });
    const workflow: WorkflowDefinition = {
      id: "knowledge-propose-only",
      version: "0.1",
      skill: "test-case-gen",
      nodes: [{ id: "propose-knowledge", type: "tool" }],
    };

    const result = await executor.start({
      location,
      definition: workflow,
      runId: "run-knowledge-propose",
    });

    expect(result.state.status).toBe("succeeded");
    const trace = readFileSync(
      join(featureDir(location), "traces", "run-knowledge-propose.jsonl"),
      "utf8",
    );
    expect(trace).toContain('"type":"knowledge-propose"');
  });

  test("marks dispatch error failed and saves state", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };

    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", () => {
      throw new Error("PLUGIN_NETWORK_TRANSIENT 503");
    });

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "run-transient",
      sourceUrl: "mock://poor-prd",
    });

    const dir = featureDir(location);
    const saved = loadWorkflowState(dir, "run-transient");
    const node = result.state.nodes["ingest-requirement-source"];
    const savedNode = saved.nodes["ingest-requirement-source"];

    expect(result.state.status).toBe("failed");
    expect(saved.status).toBe("failed");
    expect(node.status).toBe("failed");
    expect(node.error).toContain("PLUGIN_NETWORK_TRANSIENT 503");
    expect(savedNode.status).toBe("failed");
    expect(savedNode.retryable).toBe(true);
    expect(savedNode.error).toContain("PLUGIN_NETWORK_TRANSIENT 503");
    expect(readFileSync(join(dir, "traces", "run-transient.jsonl"), "utf8")).toContain(
      '"message":"PLUGIN_NETWORK_TRANSIENT 503"',
    );
  });

  test("reruns retryable failed nodes on resume", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    let calls = 0;
    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", () => {
      calls += 1;
      if (calls === 1) throw new Error("PLUGIN_NETWORK_TRANSIENT 503");
      return {
        schemaVersion: "0.1",
        sourceType: "lanhu",
        sourceUrl: "mock://poor-prd",
        title: "规则配置",
        textBlocks: [{ id: "SRC-001", content: "保存按钮" }],
        images: [],
        rawFiles: [
          {
            id: "RAW-001",
            path: "sources/lanhu/raw.html",
            mediaType: "text/html",
            hash: "sha256:test",
          },
        ],
        fetchedAt: "2026-05-02T00:00:00.000Z",
      };
    });
    const workflow: WorkflowDefinition = {
      id: "retry-source",
      version: "0.1",
      skill: "test-case-gen",
      nodes: [
        {
          id: "ingest-requirement-source",
          type: "tool",
          action: "lanhu.fetchRequirement",
        },
      ],
    };
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const failed = await executor.start({
      location,
      definition: workflow,
      runId: "run-retry-source",
    });
    const resumed = await executor.resume({
      location,
      definition: workflow,
      runId: "run-retry-source",
    });

    expect(failed.state.status).toBe("failed");
    expect(failed.state.nodes["ingest-requirement-source"].retryable).toBe(true);
    expect(resumed.state.status).toBe("succeeded");
    expect(calls).toBe(2);
  });

  test("does not rerun fatal failed nodes on resume", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    let calls = 0;
    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", () => {
      calls += 1;
      if (calls === 1) throw new Error("MISSING_SECRET lanhu cookie");
      return {
        schemaVersion: "0.1",
        sourceType: "lanhu",
        sourceUrl: "mock://poor-prd",
        title: "规则配置",
        textBlocks: [{ id: "SRC-001", content: "保存按钮" }],
        images: [],
        rawFiles: [
          {
            id: "RAW-001",
            path: "sources/lanhu/raw.html",
            mediaType: "text/html",
            hash: "sha256:test",
          },
        ],
        fetchedAt: "2026-05-02T00:00:00.000Z",
      };
    });
    const workflow: WorkflowDefinition = {
      id: "fatal-source",
      version: "0.1",
      skill: "test-case-gen",
      nodes: [
        {
          id: "ingest-requirement-source",
          type: "tool",
          action: "lanhu.fetchRequirement",
        },
      ],
    };
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const failed = await executor.start({
      location,
      definition: workflow,
      runId: "run-fatal-source",
    });
    const resumed = await executor.resume({
      location,
      definition: workflow,
      runId: "run-fatal-source",
    });

    expect(failed.state.status).toBe("failed");
    expect(failed.state.nodes["ingest-requirement-source"].retryable).toBe(false);
    expect(resumed.state.status).toBe("failed");
    expect(resumed.state.nodes["ingest-requirement-source"].error).toBe(
      "MISSING_SECRET lanhu cookie",
    );
    expect(calls).toBe(1);
  });

  test("blocks unusable requirement sources before agent normalization", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "empty-source" };

    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", () => ({
      schemaVersion: "0.1",
      sourceType: "lanhu",
      sourceUrl: "mock://empty",
      textBlocks: [],
      images: [],
      rawFiles: [],
      fetchedAt: "2026-05-02T00:00:00.000Z",
    }));

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "run-empty-source",
      sourceUrl: "mock://empty",
    });

    expect(result.state.status).toBe("blocked");
    expect(result.state.currentNode).toBe("ingest-requirement-source");
    expect(result.state.nodes["ingest-requirement-source"].status).toBe(
      "blocked",
    );
    expect(
      readFileSync(join(featureDir(location), "traces", "run-empty-source.jsonl"), "utf8"),
    ).toContain('"gateId":"source-integrity"');
  });

  test("does not overwrite xmind file created by export action", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeTestSpec(location);

    const actions = new PluginActionRegistry();
    actions.register("xmind.export", (_, context) => {
      const outputPath = "exports/xmind/test-spec.xmind";
      const target = artifactPath(context, outputPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "real xmind sentinel\n");
      return {
        schemaVersion: "0.1",
        outputPath,
        caseCount: 1,
      } satisfies XMindExport;
    });

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const result = await executor.start({
      location,
      definition: xmindOnlyWorkflow,
      runId: "run-xmind",
    });

    expect(result.state.status).toBe("succeeded");
    expect(
      readFileSync(
        artifactPath(location, "exports/xmind/test-spec.xmind"),
        "utf8",
      ),
    ).toBe("real xmind sentinel\n");
    expect(
      readFileSync(
        artifactPath(location, "exports/xmind/xmind-export.json"),
        "utf8",
      ),
    ).toContain('"outputPath": "exports/xmind/test-spec.xmind"');
    expect(
      readArtifactIndex(location).artifacts.some(
        (item) =>
          item.type === "XMindFile" &&
          item.path === "exports/xmind/test-spec.xmind",
      ),
    ).toBe(true);
  });

  test("overwrites stale xmind file with mock fallback", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const outputPath = "exports/xmind/test-spec.xmind";
    const stalePath = artifactPath(location, outputPath);
    writeTestSpec(location);
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, "stale xmind content\n");
    const staleTime = new Date("2020-01-01T00:00:00.000Z");
    utimesSync(stalePath, staleTime, staleTime);

    const actions = new PluginActionRegistry();
    actions.register("xmind.export", () => {
      return {
        schemaVersion: "0.1",
        outputPath,
        caseCount: 1,
      } satisfies XMindExport;
    });

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const result = await executor.start({
      location,
      definition: xmindOnlyWorkflow,
      runId: "run-xmind-stale",
    });

    expect(result.state.status).toBe("succeeded");
    expect(readFileSync(stalePath, "utf8")).toBe("mock xmind export: 1 cases\n");
  });

  test("blocks when XMind export case count differs from TestSpec", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeTestSpec(location);

    const actions = new PluginActionRegistry();
    actions.register("xmind.export", () => ({
      schemaVersion: "0.1",
      outputPath: "exports/xmind/test-spec.xmind",
      caseCount: 0,
    }) satisfies XMindExport);

    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });

    const result = await executor.start({
      location,
      definition: xmindWithConsistencyWorkflow,
      runId: "run-xmind-mismatch",
    });

    expect(result.state.status).toBe("blocked");
    expect(result.state.currentNode).toBe("gate-artifact-consistency");
    expect(result.state.nodes["gate-artifact-consistency"].status).toBe(
      "blocked",
    );
    expect(
      readFileSync(join(featureDir(location), "traces", "run-xmind-mismatch.jsonl"), "utf8"),
    ).toContain("XMind case count 0 does not match TestSpec case count 1");
  });

  test("reconstructs gate results from trace when resuming into design report", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const dir = createFeatureWorkspace(location);
    const runId = "run-report-resume";
    saveWorkflowState(
      dir,
      markSucceeded(
        createRunState(designReportAfterGateWorkflow, runId),
        "gate-readiness",
      ),
    );
    appendTrace(dir, {
      runId,
      nodeId: "gate-readiness",
      type: "gate-passed",
      gateId: "requirement-test-readiness",
      at: new Date().toISOString(),
      details: { violations: [] },
    });
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions: new PluginActionRegistry(),
      agents: new Map(),
    });

    const result = await executor.resume({
      location,
      definition: designReportAfterGateWorkflow,
      runId,
    });

    expect(result.state.status).toBe("succeeded");
    const report = JSON.parse(
      readFileSync(join(dir, "reports/design-report.json"), "utf8"),
    ) as {
      gateResults: Array<{
        gateId: string;
        passed: boolean;
        violations: unknown[];
      }>;
    };
    expect(report.gateResults).toEqual([
      { gateId: "requirement-test-readiness", passed: true, violations: [] },
    ]);
  });

  test("invalidates the artifact writer and downstream nodes when an indexed artifact hash no longer matches", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const runId = "run-hash-mismatch";
    writeTestSpec(location);
    let exports = 0;
    const actions = new PluginActionRegistry();
    actions.register("xmind.export", () => {
      exports += 1;
      return {
        schemaVersion: "0.1",
        outputPath: "exports/xmind/test-spec.xmind",
        caseCount: 1,
      } satisfies XMindExport;
    });
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });
    const first = await executor.start({
      location,
      definition: xmindWithConsistencyWorkflow,
      runId,
    });
    expect(first.state.status).toBe("succeeded");

    writeFileSync(
      artifactPath(location, "exports/xmind/xmind-export.json"),
      '{"tampered":true}\n',
    );

    const result = await executor.resume({
      location,
      definition: xmindWithConsistencyWorkflow,
      runId,
    });

    expect(result.state.status).toBe("succeeded");
    expect(exports).toBe(2);
    expect(result.state.nodes["export-xmind"]).toEqual({
      status: "succeeded",
      artifactRefs: expect.any(Array),
    });
    expect(result.state.nodes["gate-artifact-consistency"].status).toBe(
      "succeeded",
    );
  });
});
