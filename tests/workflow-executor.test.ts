import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../packages/agent-runner/src/index";
import { featureDir } from "../packages/artifact-repo/src/index";
import { consultKnowledge } from "../packages/knowledge-repo/src/index";
import { PluginActionRegistry } from "../packages/plugin-runtime/src/index";
import {
  loadWorkflowState,
  WorkflowExecutor,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";
import { mockFetchRequirement } from "../plugins/lanhu/src/mock";

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
    actions.register("lanhu.fetchRequirement", mockFetchRequirement);
    actions.register("knowledge.consult", (input) => consultKnowledge(input as any));

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
  });
});
