import { describe, expect, test } from "bun:test";
import {
  SkillRegistry,
  SkillRunner,
  type SkillManifest,
} from "../packages/skill-runner/src/index";
import type { WorkflowDefinition } from "../packages/workflow-engine/src/index";

describe("skill registry", () => {
  test("registers and lists skills", () => {
    const registry = new SkillRegistry();
    const manifest: SkillManifest = {
      name: "test-case-gen",
      title: "测试用例生成",
      version: "0.1.0",
      description: "生成测试资产",
      workflow: "test-case-gen",
      outputs: ["TestSpec"],
    };

    registry.register(manifest);

    expect(registry.get("test-case-gen")?.workflow).toBe("test-case-gen");
    expect(registry.list()).toHaveLength(1);
    expect(new SkillRunner()).toBeInstanceOf(SkillRunner);
  });

  test("starts a workflow after validating skill input", async () => {
    const skill: SkillManifest = {
      name: "test-case-gen",
      title: "测试用例生成",
      version: "0.1.0",
      description: "生成测试资产",
      workflow: "test-case-gen",
      inputs: { schema: "TestCaseGenInput" },
      outputs: ["TestSpec"],
    };
    const workflow: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "create-feature-workspace", type: "artifact" }],
    };
    const starts: Array<{
      workflow: WorkflowDefinition;
      runId: string;
      input: unknown;
    }> = [];
    const runner = new SkillRunner({
      loadWorkflow: async (workflowId) => {
        expect(workflowId).toBe("test-case-gen");
        return workflow;
      },
      generateRunId: () => "run-generated",
      startWorkflow: async (loadedWorkflow, runId, input) => {
        starts.push({ workflow: loadedWorkflow, runId, input });
        return { status: "waiting", currentNode: "await-confirmation-result" };
      },
    });

    const input = {
      project: "demo",
      feature: "rule-config",
      source: { type: "lanhu", url: "https://lanhu.example/prd/1" },
    };

    const handle = await runner.start(skill, input);

    expect(handle).toEqual({
      runId: "run-generated",
      workflowId: "test-case-gen",
      status: "waiting",
      currentNode: "await-confirmation-result",
    });
    expect(starts).toEqual([{ workflow, runId: "run-generated", input }]);
  });

  test("rejects invalid skill input before starting workflow", async () => {
    const skill: SkillManifest = {
      name: "test-case-gen",
      title: "测试用例生成",
      version: "0.1.0",
      description: "生成测试资产",
      workflow: "test-case-gen",
      inputs: { schema: "TestCaseGenInput" },
    };
    const runner = new SkillRunner({
      loadWorkflow: async () => {
        throw new Error("workflow should not load for invalid input");
      },
      startWorkflow: async () => ({ status: "running" }),
      generateRunId: () => "run-unused",
    });

    await expect(
      runner.start(skill, { project: "demo", feature: "rule-config" }),
    ).rejects.toThrow("SCHEMA_VALIDATION_FAILED TestCaseGenInput");
  });
});
