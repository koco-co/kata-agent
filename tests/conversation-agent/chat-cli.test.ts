// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Chat CLI and approval-tools module
// loading tests
// ---------------------------------------------------------------------------
import { describe, expect, test } from "bun:test";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";
import { createApprovalTool } from "../../packages/conversation-agent/src/tools/approval-tools";

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const ctx: ToolContext = {
  workspaceRoot: "/tmp/test-workspace",
  sessionId: "test-session-approval",
  yolo: false,
  env: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(
  r: ToolResult,
): asserts r is {
  ok: false;
  summary: string;
  error: { code: string; retryable: boolean; message: string };
} {
  expect(r.ok).toBe(false);
  expect(r.error).toBeObject();
}

// ===========================================================================
// Approval Tool Tests
// ===========================================================================

describe("approval tool", () => {
  const tmpDir = "/tmp/test-approvals";
  const tool = createApprovalTool(tmpDir, { timeout: 1 });

  test("createApprovalTool returns a tool with correct metadata", () => {
    expect(tool.name).toBe("approval.request");
    expect(tool.description).toBeString();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(tool.permission).toBe("safe");
    expect(tool.toolset).toBe("approvals");
    expect(tool.inputSchema).toBeObject();
    expect(tool.inputSchema).toHaveProperty("properties");
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props).toHaveProperty("action");
    expect(props).toHaveProperty("details");
  });

  test("approval.request denies when not in interactive mode (isTTY is false)", async () => {
    // In a test environment process.stdin.isTTY is undefined (falsy)
    const result = await tool.execute(
      {
        action: "write-file",
        details: "Write to /etc/passwd",
      },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("APPROVAL_DENIED");
    expect(result.summary).toContain("not in interactive mode");
  });

  test("approval.request returns INVALID_INPUT when action is missing", async () => {
    const result = await tool.execute(
      {
        details: "Some details without an action",
      },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("approval.request returns INVALID_INPUT for empty action", async () => {
    const result = await tool.execute(
      {
        action: "",
        details: "Empty action",
      },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("createApprovalTool accepts custom timeout option", () => {
    const fastTool = createApprovalTool("/tmp/test-approvals-fast", { timeout: 5 });
    expect(fastTool.name).toBe("approval.request");
  });
});

// ===========================================================================
// Chat CLI Module Loading Test
// ===========================================================================

describe("chat CLI module", () => {
  test("chat module can be loaded without error", async () => {
    // Just verify the module imports resolve and its exports are correct
    const chatModule = await import("../../apps/cli/src/chat");
    expect(chatModule).toHaveProperty("startChat");
    expect(typeof chatModule.startChat).toBe("function");
  });

  test("agent module can be loaded without error", async () => {
    const agentModule = await import("../../packages/conversation-agent/src/agent");
    expect(agentModule).toHaveProperty("ConversationAgent");
    expect(typeof agentModule.ConversationAgent).toBe("function");
  });
});
