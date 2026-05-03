import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../../packages/conversation-agent/src/prompts";
import type { ConversationTool } from "../../packages/conversation-agent/src/types";

function makeTool(name: string): ConversationTool {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: "object" },
    permission: "safe",
    toolset: "qa-workflows",
    execute: async () => ({ ok: true, summary: "done" }),
  };
}

describe("testing system prompt", () => {
  test("adds testing identity while preserving tool listing", () => {
    const prompt = buildSystemPrompt(
      [makeTool("test.run"), makeTool("workflow_start")],
      ["qa-workflows"],
      "Detected: Workflow: test-run.",
      {
        testingWorkspace: {
          root: "/repo/kata-demo",
          name: "kata-demo",
          status: "ready",
          featureCount: 2,
          specCount: 3,
          caseAssetCount: 4,
          reportCount: 1,
          featureFiles: ["features/login.feature", "features/pay.feature"],
        },
      },
    );

    expect(prompt).toContain("测试领域 CLI 助手");
    expect(prompt).toContain("中文优先");
    expect(prompt).toContain("kata-demo");
    expect(prompt).toContain("Feature 数量：2");
    expect(prompt).toContain("test.run");
    expect(prompt).toContain("Permission: safe");
    expect(prompt).toContain("Detected: Workflow: test-run.");
  });
});
