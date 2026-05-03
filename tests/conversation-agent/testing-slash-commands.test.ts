import { describe, expect, test } from "bun:test";
import { handleTestingSlashCommand } from "../../packages/conversation-agent/src/testing/slash-commands";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";

const context: ToolContext = {
  workspaceRoot: "/repo",
  sessionId: "session-1",
  yolo: true,
  env: {},
};

describe("handleTestingSlashCommand", () => {
  test("lists workspace features", async () => {
    const result = await handleTestingSlashCommand({
      command: "/features",
      context,
      workspace: {
        root: "/repo",
        name: "demo",
        status: "ready",
        featureCount: 1,
        specCount: 0,
        caseAssetCount: 0,
        reportCount: 0,
        featureFiles: ["features/login.feature"],
      },
      executeTool: async () => ({ ok: true, summary: "unused" }),
      listTestingTools: () => [],
    });

    expect(result).toContain("features/login.feature");
  });

  test("routes /test-run to test.run tool", async () => {
    const calls: string[] = [];
    const result = await handleTestingSlashCommand({
      command: "/test-run login",
      context,
      workspace: undefined,
      executeTool: async (name, input): Promise<ToolResult> => {
        calls.push(`${name}:${JSON.stringify(input)}`);
        return { ok: true, summary: "run queued" };
      },
      listTestingTools: () => ["test.run"],
    });

    expect(result).toBe("run queued");
    expect(calls[0]).toContain("test.run");
    expect(calls[0]).toContain("login");
  });
});
