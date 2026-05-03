import { describe, expect, test } from "bun:test";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";
import {
  createTestingTools,
  type TestingActionBridge,
} from "../../packages/conversation-agent/src/testing/tools";

const ctx: ToolContext = {
  workspaceRoot: "/repo",
  sessionId: "session-1",
  yolo: true,
  env: {},
};

function createBridge(): { bridge: TestingActionBridge; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    bridge: {
      executeAction: async (actionId, input, context): Promise<ToolResult> => {
        calls.push(`${actionId}:${context.sessionId}:${JSON.stringify(input)}`);
        return { ok: true, summary: `executed ${actionId}`, data: { actionId } };
      },
    },
  };
}

describe("createTestingTools", () => {
  test("registers all test tools as ConversationTool-compatible definitions", () => {
    const { bridge } = createBridge();
    const tools = createTestingTools(bridge);

    expect(tools.map((tool) => tool.name)).toEqual([
      "test.run",
      "test.gen_cases",
      "test.scan",
      "test.report",
      "test.export_xmind",
      "test.prepare_env",
      "test.session",
    ]);

    for (const tool of tools) {
      expect(tool.permission).toBeString();
      expect(tool.toolset).toBe("qa-workflows");
      expect(tool.execute).toBeFunction();
    }
  });

  test("routes test.run by actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.run")!;

    const result = await tool.execute({ target: "login" }, ctx);

    expect(result.summary).toContain("playwright.runPlan");
    expect(calls[0]).toContain("playwright.runPlan");
  });

  test("routes script generation to skill.ui-script-gen actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.gen_cases")!;

    await tool.execute({ source: "login page", format: "playwright-script" }, ctx);

    expect(calls[0]).toContain("skill.ui-script-gen");
  });

  test("routes default case generation to skill.test-case-gen actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.gen_cases")!;

    await tool.execute({ source: "登录需求" }, ctx);

    expect(calls[0]).toContain("skill.test-case-gen");
  });
});
