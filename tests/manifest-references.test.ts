import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import YAML from "yaml";
import { SCHEMA_REGISTRY } from "../packages/domain/src/index";
import {
  BUILT_IN_ACTION_IDS,
  GATE_REGISTRY,
} from "../packages/workflow-engine/src/index";

const schemaNames = new Set(Object.keys(SCHEMA_REGISTRY));

const promptHeadings = [
  "# 角色",
  "# 职责",
  "# 输入",
  "# 输出",
  "# 工作步骤",
  "# 边界",
  "# 完成标准",
];
const gateNames = new Set(Object.keys(GATE_REGISTRY));
const builtInActionIds = new Set(BUILT_IN_ACTION_IDS);
const nodeTypes = new Set(["tool", "agent", "gate", "human", "artifact"]);

function yamlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map((entry) => join(root, String(entry)))
    .filter((path) => path.endsWith(".yaml"));
}

describe("manifest schema references", () => {
  test("agent, skill, and plugin schemas are known", () => {
    const files = [
      ...yamlFiles("agents"),
      ...yamlFiles("skills"),
      ...yamlFiles("plugins"),
    ];
    for (const file of files) {
      const doc = YAML.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      for (const key of ["inputSchema", "outputSchema"]) {
        const value = doc[key];
        if (typeof value === "string") {
          expect(schemaNames.has(value), `${file} ${key}=${value}`).toBe(true);
        }
      }
      const inputs = doc.inputs as { schema?: string } | undefined;
      if (inputs?.schema) {
        expect(
          schemaNames.has(inputs.schema),
          `${file} inputs.schema=${inputs.schema}`,
        ).toBe(true);
      }
      const outputs = doc.outputs as string[] | undefined;
      for (const output of outputs ?? []) {
        expect(schemaNames.has(output), `${file} output=${output}`).toBe(true);
      }
      const promptPath = doc.promptPath as string | undefined;
      if (promptPath) {
        const fullPromptPath = join(dirname(file), promptPath);
        expect(
          existsSync(fullPromptPath),
          `${file} promptPath=${promptPath}`,
        ).toBe(true);
        const prompt = readFileSync(fullPromptPath, "utf8");
        for (const heading of promptHeadings) expect(prompt).toContain(heading);
      }
      const actions = doc.actions as
        | Array<{ inputSchema?: string; outputSchema?: string }>
        | undefined;
      for (const action of actions ?? []) {
        if (action.inputSchema) {
          expect(
            schemaNames.has(action.inputSchema),
            `${file} action.inputSchema=${action.inputSchema}`,
          ).toBe(true);
        }
        if (action.outputSchema) {
          expect(
            schemaNames.has(action.outputSchema),
            `${file} action.outputSchema=${action.outputSchema}`,
          ).toBe(true);
        }
      }
    }
  });

  test("non-interface skill workflows exist", () => {
    for (const file of yamlFiles("skills")) {
      const doc = YAML.parse(readFileSync(file, "utf8")) as {
        workflow?: string;
        status?: string;
      };
      if (!doc.workflow || doc.status === "interface-only") continue;
      expect(
        existsSync(join("workflows", `${doc.workflow}.yaml`)),
        `${file} workflow=${doc.workflow}`,
      ).toBe(true);
    }
  });

  test("workflow node references are resolvable", () => {
    const agentNames = new Set(
      yamlFiles("agents").map(
        (file) =>
          (YAML.parse(readFileSync(file, "utf8")) as { name: string }).name,
      ),
    );
    const actionIds = new Set([
      ...builtInActionIds,
      ...yamlFiles("plugins").flatMap((file) => {
        const doc = YAML.parse(readFileSync(file, "utf8")) as {
          actions?: Array<{ id: string }>;
        };
        return (doc.actions ?? []).map((action) => action.id);
      }),
    ]);
    for (const file of yamlFiles("workflows")) {
      const workflow = YAML.parse(readFileSync(file, "utf8")) as {
        nodes: Array<{
          id: string;
          type: string;
          agent?: string;
          action?: string;
          gate?: string;
          dependsOn?: string[];
        }>;
      };
      const nodeIds = new Set(workflow.nodes.map((node) => node.id));
      expect(nodeIds.size, `${file} duplicate node ids`).toBe(
        workflow.nodes.length,
      );
      const nodeIndex = new Map(
        workflow.nodes.map((node, index) => [node.id, index]),
      );
      for (const node of workflow.nodes) {
        expect(nodeTypes.has(node.type), `${file} node type=${node.type}`).toBe(
          true,
        );
        if (node.agent) {
          expect(agentNames.has(node.agent), `${file} agent=${node.agent}`).toBe(
            true,
          );
        }
        if (node.action) {
          expect(
            actionIds.has(node.action),
            `${file} action=${node.action}`,
          ).toBe(true);
        }
        if (node.gate) {
          expect(gateNames.has(node.gate), `${file} gate=${node.gate}`).toBe(
            true,
          );
        }
        for (const dependency of node.dependsOn ?? []) {
          expect(nodeIds.has(dependency), `${file} dependsOn=${dependency}`).toBe(
            true,
          );
          expect(
            nodeIndex.get(dependency)!,
            `${file} dependency order=${dependency}->${node.id}`,
          ).toBeLessThan(nodeIndex.get(node.id)!);
        }
      }
    }
  });

  test("ui-script-gen workflow remains web automation only", () => {
    const skill = YAML.parse(
      readFileSync("skills/ui-script-gen/skill.yaml", "utf8"),
    ) as {
      name: string;
      workflow: string;
      requiredPlugins?: string[];
    };
    const workflow = YAML.parse(
      readFileSync("workflows/ui-script-gen.yaml", "utf8"),
    ) as {
      skill: string;
      nodes: Array<{
        id: string;
        type: string;
        action?: string;
        gate?: string;
        dependsOn?: string[];
      }>;
    };
    expect(skill.name).toBe("ui-script-gen");
    expect(skill.workflow).toBe("ui-script-gen");
    expect(skill.requiredPlugins).toEqual(["playwright"]);
    expect(workflow.skill).toBe("ui-script-gen");
    expect(workflow.nodes).toEqual([
      { id: "create-automation-workspace", type: "artifact" },
      {
        id: "load-test-spec",
        type: "artifact",
        dependsOn: ["create-automation-workspace"],
      },
      {
        id: "build-flow-spec",
        type: "artifact",
        dependsOn: ["load-test-spec"],
      },
      {
        id: "gate-automation-script-readiness",
        type: "gate",
        gate: "automation-script-readiness",
        dependsOn: ["build-flow-spec"],
      },
      {
        id: "build-run-plan",
        type: "artifact",
        dependsOn: ["gate-automation-script-readiness"],
      },
      {
        id: "execute-run-plan",
        type: "tool",
        action: "playwright.runPlan",
        dependsOn: ["build-run-plan"],
      },
      {
        id: "collect-evidence",
        type: "artifact",
        dependsOn: ["execute-run-plan"],
      },
      {
        id: "write-automation-report",
        type: "artifact",
        dependsOn: ["collect-evidence"],
      },
    ]);
  });
});
