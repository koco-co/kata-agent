import { describe, expect, test } from "bun:test";

// Value import — will fail if the module does not exist
import {
  ALL_TOOLSETS,
  ALL_PERMISSIONS,
  ALL_SLASH_COMMANDS,
} from "../../packages/conversation-agent/src/index";

import type {
  ConversationTool,
  ToolResult,
  SessionState,
  ToolPermission,
  ToolsetName,
  ToolContext,
  ChatMessage,
  SessionMetadata,
  SlashCommand,
} from "../../packages/conversation-agent/src/index";

// ---------------------------------------------------------------------------
// Module existence check
// ---------------------------------------------------------------------------

describe("module exports", () => {
  test("module resolves with expected value exports", () => {
    expect(ALL_TOOLSETS).toBeArray();
    expect(ALL_PERMISSIONS).toBeArray();
    expect(ALL_SLASH_COMMANDS).toBeArray();
  });
});

// ---------------------------------------------------------------------------
// Type-level checks (static assertions that the types exist and are shaped
// correctly).
// ---------------------------------------------------------------------------

describe("ConversationTool type", () => {
  test("has all required fields", () => {
    const tool: ConversationTool = {
      name: "test-tool",
      description: "A test tool",
      inputSchema: { type: "object", properties: {} },
      permission: "safe",
      toolset: "shell",
      execute: async (_input: Record<string, unknown>, _context: ToolContext) => {
        return { ok: true, summary: "done" };
      },
    };

    expect(tool.name).toBeString();
    expect(tool.description).toBeString();
    expect(tool.inputSchema).toBeObject();
    expect(tool.permission).toBeString();
    expect(tool.toolset).toBeString();
    expect(tool.execute).toBeFunction();
  });

  test("permission accepts all valid values", () => {
    const permissions: ToolPermission[] = [
      "safe",
      "workspace-write",
      "command",
      "external",
    ];
    for (const p of permissions) {
      const tool: ConversationTool = {
        name: p,
        description: p,
        inputSchema: { type: "object" },
        permission: p,
        toolset: "files",
        execute: async () => ({ ok: true, summary: p }),
      };
      expect(tool.permission).toBe(p);
    }
  });

  test("toolset accepts all valid values", () => {
    const toolsets: ToolsetName[] = ALL_TOOLSETS;
    for (const t of toolsets) {
      const tool: ConversationTool = {
        name: t,
        description: t,
        inputSchema: { type: "object" },
        permission: "safe",
        toolset: t as any,
        execute: async () => ({ ok: true, summary: t }),
      };
      expect(tool.toolset).toBe(t);
    }
  });
});

describe("ToolResult type", () => {
  test("supports success shape", () => {
    const result: ToolResult = { ok: true, summary: "All good" };
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("All good");
  });

  test("supports success shape with optional data", () => {
    const result: ToolResult = {
      ok: true,
      summary: "With data",
      data: { lines: [1, 2, 3] },
    };
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ lines: [1, 2, 3] });
  });

  test("supports error shape", () => {
    const result: ToolResult = {
      ok: false,
      summary: "Failed",
      error: { code: "PERMISSION_DENIED", retryable: false, message: "Nope" },
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBeObject();
    expect(result.error!.code).toBe("PERMISSION_DENIED");
    expect(result.error!.retryable).toBe(false);
    expect(result.error!.message).toBe("Nope");
  });

  test("supports retryable error shape", () => {
    const result: ToolResult = {
      ok: false,
      summary: "Temp failure",
      error: { code: "TIMEOUT", retryable: true, message: "Try again" },
    };
    expect(result.ok).toBe(false);
    expect(result.error!.retryable).toBe(true);
  });
});

describe("SessionState type", () => {
  test("has all required fields", () => {
    const state: SessionState = {
      sessionId: "sess-123",
      messages: [],
      enabledToolsets: ["shell"],
      yolo: false,
    };

    expect(state.sessionId).toBe("sess-123");
    expect(state.messages).toBeArray();
    expect(state.enabledToolsets).toBeArray();
    expect(state.yolo).toBeBoolean();

    // Optional fields
    expect((state as any).project).toBeUndefined();
    expect((state as any).feature).toBeUndefined();
    expect((state as any).recentRuns).toBeUndefined();
  });

  test("supports all optional fields", () => {
    const state: SessionState = {
      sessionId: "sess-456",
      messages: [],
      enabledToolsets: ["files", "shell"],
      yolo: true,
      project: "MyApp",
      feature: "Login flow",
      recentRuns: ["run-a", "run-b"],
    };

    expect(state.project).toBe("MyApp");
    expect(state.feature).toBe("Login flow");
    expect(state.recentRuns).toEqual(["run-a", "run-b"]);
  });
});

describe("SessionMetadata type", () => {
  test("tracks display name, counts, timestamps, and resumable state", () => {
    const metadata: SessionMetadata = {
      sessionId: "sess-meta",
      name: "命名会话",
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:01:00.000Z",
      messageCount: 3,
      yolo: true,
      enabledToolsets: ["files", "shell"],
    };

    expect(metadata.name).toBe("命名会话");
    expect(metadata.messageCount).toBe(3);
    expect(metadata.yolo).toBe(true);
    expect(metadata.enabledToolsets).toEqual(["files", "shell"]);
  });
});

describe("ChatMessage union type", () => {
  test("UserMessage shape", () => {
    const msg: ChatMessage = {
      role: "user",
      content: "Hello",
      attachments: [],
    };
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
  });

  test("ToolCallMessage shape", () => {
    const msg: ChatMessage = {
      role: "assistant",
      content: "Calling tool...",
      reasoningContent: "Need to inspect the file",
      toolCalls: [{ id: "call-1", name: "read-file", args: { path: "test.ts" } }],
    };
    expect(msg.role).toBe("assistant");
    expect(msg.reasoningContent).toBe("Need to inspect the file");
    expect("toolCalls" in msg && msg.toolCalls).toBeTruthy();
    if ("toolCalls" in msg && msg.toolCalls) {
      expect(msg.toolCalls[0].name).toBe("read-file");
    }
  });

  test("ToolResultMessage shape", () => {
    const msg: ChatMessage = {
      role: "tool",
      toolCallId: "call-1",
      content: "Result data",
    };
    expect(msg.role).toBe("tool");
    expect(msg.toolCallId).toBe("call-1");
  });

  test("FinalMessage shape", () => {
    const msg: ChatMessage = {
      role: "assistant",
      content: "Here is the final answer",
      reasoningContent: "The available context supports this answer",
      isFinal: true,
      toolCalls: [],
    };
    expect(msg.role).toBe("assistant");
    expect(msg.reasoningContent).toBe("The available context supports this answer");
    expect(msg.isFinal).toBe(true);
  });
});

describe("SlashCommand type", () => {
  test("accepts all slash command values", () => {
    const commands: SlashCommand[] = ALL_SLASH_COMMANDS;
    for (const cmd of commands) {
      expect(cmd).toBeString();
    }
    expect(commands).toContain("help");
    expect(commands).toContain("status");
    expect(commands).toContain("new");
    expect(commands).toContain("model");
    expect(commands).toContain("tools");
    expect(commands).toContain("yolo");
    expect(commands).toContain("title");
    expect(commands).toContain("sessions");
    expect(commands).toContain("resume");
    expect(commands).toContain("test-run");
    expect(commands).toContain("test-list");
    expect(commands).toContain("test-gen");
    expect(commands).toContain("scan");
    expect(commands).toContain("report");
    expect(commands).toContain("features");
    expect(commands).toContain("exit");
  });
});

describe("ToolContext type", () => {
  test("has all required fields", () => {
    const ctx: ToolContext = {
      workspaceRoot: "/project",
      sessionId: "sess-789",
      yolo: false,
      env: { NODE_ENV: "test" },
    };
    expect(ctx.workspaceRoot).toBe("/project");
    expect(ctx.sessionId).toBe("sess-789");
    expect(ctx.yolo).toBe(false);
    expect(ctx.env).toEqual({ NODE_ENV: "test" });
  });
});

describe("ALL_PERMISSIONS constant", () => {
  test("contains all four permission levels", () => {
    expect(ALL_PERMISSIONS).toEqual([
      "safe",
      "workspace-write",
      "command",
      "external",
    ]);
  });
});
