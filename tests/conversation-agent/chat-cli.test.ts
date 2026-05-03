// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Chat CLI and approval-tools module
// loading tests
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";
import { createApprovalTool } from "../../packages/conversation-agent/src/tools/approval-tools";

const readlineHandlers = new Map<string, (...args: unknown[]) => void>();
const fakeReadline = {
  prompt: mock(() => undefined),
  on: mock((event: string, handler: (...args: unknown[]) => void) => {
    readlineHandlers.set(event, handler);
  }),
  close: mock(() => {
    readlineHandlers.get("close")?.();
  }),
};
const createInterfaceMock = mock(() => fakeReadline);

mock.module("node:readline", () => ({
  createInterface: createInterfaceMock,
}));

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const ctx: ToolContext = {
  workspaceRoot: "/tmp/test-workspace",
  sessionId: "test-session-approval",
  yolo: false,
  env: {},
};

beforeEach(() => {
  readlineHandlers.clear();
  fakeReadline.prompt.mockClear();
  fakeReadline.on.mockClear();
  fakeReadline.close.mockClear();
  createInterfaceMock.mockClear();
});

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
    expect(tool.name).toBe("approval_request");
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
    expect(fastTool.name).toBe("approval_request");
  });
});

// ===========================================================================
// Chat CLI Module Loading Test
// ===========================================================================

describe("chat CLI module", () => {
  test("formatChatResponseForTerminal prints reasoning before final response in gray", async () => {
    const chatModule = await import("../../apps/cli/src/chat");

    const formatted = chatModule.formatChatResponseForTerminal({
      finalResponse: "最终答复",
      reasoningContent: "先检查上下文",
    });

    expect(formatted).toContain("\x1b[90m");
    expect(formatted).toContain("🤔 模型推理过程：\n先检查上下文\n---\n");
    expect(formatted.indexOf("先检查上下文")).toBeLessThan(
      formatted.indexOf("最终答复"),
    );
    expect(formatted.trimEnd()).toEndWith("最终答复");
  });

  test("startChat warns in Chinese and exits when apiKey is empty", async () => {
    const chatModule = await import("../../apps/cli/src/chat");
    const originalExit = process.exit;
    const originalError = console.error;
    const errors: string[] = [];
    const exitCodes: Array<string | number | null | undefined> = [];

    process.exit = ((code?: string | number | null | undefined) => {
      exitCodes.push(code);
      throw new Error(`process.exit:${code}`);
    }) as typeof process.exit;
    console.error = mock((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    }) as typeof console.error;

    try {
      expect(() => chatModule.startChat({ apiKey: "" })).toThrow("process.exit:1");
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }

    expect(exitCodes).toEqual([1]);
    expect(errors.join("\n")).toContain("DEEPSEEK_API_KEY");
    expect(errors.join("\n")).toContain("请先设置");
    expect(createInterfaceMock).not.toHaveBeenCalled();
  });

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
