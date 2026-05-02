import { describe, expect, test } from "bun:test";
import { ToolRuntime } from "../../packages/conversation-agent/src/tool-runtime";
import type {
  ConversationTool,
  ToolContext,
  ToolResult,
} from "../../packages/conversation-agent/src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultCtx: ToolContext = {
  workspaceRoot: "/project",
  sessionId: "test-session",
  yolo: false,
  env: { NODE_ENV: "test" },
};

const yoloCtx: ToolContext = {
  ...defaultCtx,
  yolo: true,
};

function makeTool(
  name: string,
  permission: ConversationTool["permission"] = "safe",
  toolset: ConversationTool["toolset"] = "shell",
): ConversationTool {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: "object", properties: {} },
    permission,
    toolset,
    execute: async (
      _input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      return { ok: true, summary: `${name} executed` };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ToolRuntime", () => {
  describe("register / getTool / listTools", () => {
    test("registers a tool and retrieves it by name", () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("read-file");
      runtime.register(tool);
      expect(runtime.getTool("read-file")).toBe(tool);
    });

    test("listTools returns all registered tools", () => {
      const runtime = new ToolRuntime();
      const toolA = makeTool("tool-a");
      const toolB = makeTool("tool-b");
      runtime.register(toolA);
      runtime.register(toolB);
      const tools = runtime.listTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(toolA);
      expect(tools).toContain(toolB);
    });

    test("getTool returns undefined for unknown tool", () => {
      const runtime = new ToolRuntime();
      expect(runtime.getTool("nonexistent")).toBeUndefined();
    });

    test("listTools returns empty array when no tools registered", () => {
      const runtime = new ToolRuntime();
      expect(runtime.listTools()).toEqual([]);
    });

    test("registering a tool with duplicate name overwrites", () => {
      const runtime = new ToolRuntime();
      const tool1 = makeTool("duplicate");
      const tool2 = makeTool("duplicate", "command");
      runtime.register(tool1);
      runtime.register(tool2);
      expect(runtime.getTool("duplicate")).toBe(tool2);
      expect(runtime.listTools()).toHaveLength(1);
    });
  });

  describe("listToolsByToolset", () => {
    test("lists tools filtered by toolset", () => {
      const runtime = new ToolRuntime();
      const shellTool = makeTool("ls", "safe", "shell");
      const fileTool = makeTool("read", "safe", "files");
      const anotherShell = makeTool("exec", "command", "shell");
      runtime.register(shellTool);
      runtime.register(fileTool);
      runtime.register(anotherShell);

      const shellTools = runtime.listToolsByToolset("shell");
      expect(shellTools).toHaveLength(2);
      expect(shellTools).toContain(shellTool);
      expect(shellTools).toContain(anotherShell);

      const fileTools = runtime.listToolsByToolset("files");
      expect(fileTools).toHaveLength(1);
      expect(fileTools).toContain(fileTool);
    });

    test("returns empty array for toolset with no tools", () => {
      const runtime = new ToolRuntime();
      expect(runtime.listToolsByToolset("knowledge")).toEqual([]);
    });
  });

  describe("execute — permission: safe", () => {
    test("safe tool is always allowed (yolo=false)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("safe-tool", "safe");
      runtime.register(tool);
      const result = await runtime.execute("safe-tool", {}, defaultCtx);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("safe-tool executed");
    });

    test("safe tool is always allowed (yolo=true)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("safe-tool", "safe");
      runtime.register(tool);
      const result = await runtime.execute("safe-tool", {}, yoloCtx);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("safe-tool executed");
    });
  });

  describe("execute — permission: workspace-write", () => {
    test("workspace-write tool is always allowed (yolo=false)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("write-tool", "workspace-write");
      runtime.register(tool);
      const result = await runtime.execute("write-tool", {}, defaultCtx);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("write-tool executed");
    });

    test("workspace-write tool is always allowed (yolo=true)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("write-tool", "workspace-write");
      runtime.register(tool);
      const result = await runtime.execute("write-tool", {}, yoloCtx);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("write-tool executed");
    });
  });

  describe("execute — permission: command", () => {
    test("command tool with yolo=true is allowed", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("exec-tool", "command");
      runtime.register(tool);
      const result = await runtime.execute("exec-tool", {}, yoloCtx);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("exec-tool executed");
    });

    test("command tool with yolo=false returns NEEDS_APPROVAL", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("exec-tool", "command");
      runtime.register(tool);
      const result = await runtime.execute("exec-tool", {}, defaultCtx);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NEEDS_APPROVAL");
    });
  });

  describe("execute — permission: external", () => {
    test("external tool always returns NEEDS_APPROVAL (yolo=false)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("ext-tool", "external");
      runtime.register(tool);
      const result = await runtime.execute("ext-tool", {}, defaultCtx);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NEEDS_APPROVAL");
    });

    test("external tool always returns NEEDS_APPROVAL (yolo=true)", async () => {
      const runtime = new ToolRuntime();
      const tool = makeTool("ext-tool", "external");
      runtime.register(tool);
      const result = await runtime.execute("ext-tool", {}, yoloCtx);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NEEDS_APPROVAL");
    });
  });

  describe("execute — error cases", () => {
    test("unknown tool returns UNKNOWN_TOOL", async () => {
      const runtime = new ToolRuntime();
      const result = await runtime.execute("nonexistent", {}, defaultCtx);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("UNKNOWN_TOOL");
    });

    test("execution that throws returns EXECUTION_ERROR with retryable=true", async () => {
      const runtime = new ToolRuntime();
      const tool: ConversationTool = {
        name: "crash-tool",
        description: "Crashes on execute",
        inputSchema: { type: "object", properties: {} },
        permission: "safe",
        toolset: "shell",
        execute: async () => {
          throw new Error("Something went wrong");
        },
      };
      runtime.register(tool);
      const result = await runtime.execute("crash-tool", {}, defaultCtx);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_ERROR");
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe("execute — input passthrough", () => {
    test("input is passed to the tool's execute function", async () => {
      const runtime = new ToolRuntime();
      let receivedInput: Record<string, unknown> | null = null;
      const tool: ConversationTool = {
        name: "passthrough",
        description: "Records input",
        inputSchema: { type: "object", properties: {} },
        permission: "safe",
        toolset: "shell",
        execute: async (input: Record<string, unknown>) => {
          receivedInput = input;
          return { ok: true, summary: "passthrough executed" };
        },
      };
      runtime.register(tool);
      const input: Record<string, unknown> = { path: "test.txt", mode: "read" };
      await runtime.execute("passthrough", input, defaultCtx);
      expect(receivedInput).not.toBeNull();
      expect(receivedInput!).toEqual(input);
    });

    test("context is passed to the tool's execute function", async () => {
      const runtime = new ToolRuntime();
      let receivedCtx: ToolContext | null = null;
      const tool: ConversationTool = {
        name: "ctx-check",
        description: "Records context",
        inputSchema: { type: "object", properties: {} },
        permission: "safe",
        toolset: "shell",
        execute: async (
          _input: Record<string, unknown>,
          context: ToolContext,
        ) => {
          receivedCtx = context;
          return { ok: true, summary: "ctx-check executed" };
        },
      };
      runtime.register(tool);
      await runtime.execute("ctx-check", {}, defaultCtx);
      expect(receivedCtx as unknown as ToolContext).toEqual(defaultCtx);
    });
  });
});
