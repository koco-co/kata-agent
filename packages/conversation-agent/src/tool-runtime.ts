// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — ToolRuntime: registry, permission checks,
// and execution of ConversationTool instances.
// ---------------------------------------------------------------------------

import type {
  ConversationTool,
  ToolContext,
  ToolResult,
} from "./types";

/**
 * Runtime that manages tool registration, permission-based execution gating,
 * and tool discovery.
 */
export class ToolRuntime {
  private readonly _tools: Map<string, ConversationTool> = new Map();

  // ---- Registry ----------------------------------------------------------

  /**
   * Register a tool. If a tool with the same name already exists it is
   * overwritten.
   */
  register(tool: ConversationTool): void {
    this._tools.set(tool.name, tool);
  }

  /**
   * Look up a tool by name. Returns `undefined` when no tool with that name
   * has been registered.
   */
  getTool(name: string): ConversationTool | undefined {
    return this._tools.get(name);
  }

  /**
   * Return every registered tool (order is insertion order).
   */
  listTools(): ConversationTool[] {
    return Array.from(this._tools.values());
  }

  /**
   * Return all tools that belong to `toolset`.
   */
  listToolsByToolset(toolset: string): ConversationTool[] {
    return Array.from(this._tools.values()).filter(
      (t) => t.toolset === toolset,
    );
  }

  // ---- Execution ---------------------------------------------------------

  /**
   * Execute the tool identified by `name`, feeding it `input` and `context`.
   *
   * Permission gating is applied before execution:
   *  - "safe"             → always allowed
   *  - "workspace-write"  → always allowed (but logged)
   *  - "command"          → allowed only if `context.yolo === true`
   *  - "external"         → **never** allowed; always returns NEEDS_APPROVAL
   *
   * When the tool is unknown or execution throws, a non-ok `ToolResult` is
   * returned instead of bubbling the error.
   */
  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this._tools.get(name);

    // Unknown tool
    if (!tool) {
      return {
        ok: false,
        summary: `Unknown tool: "${name}"`,
        error: {
          code: "UNKNOWN_TOOL",
          retryable: false,
          message: `No tool named "${name}" is registered`,
        },
      };
    }

    // Permission check
    const permissionError = this._checkPermission(tool, context);
    if (permissionError) {
      return permissionError;
    }

    // Execute
    try {
      const result = await tool.execute(
        (input ?? {}) as Record<string, unknown>,
        context,
      );

      // Truncate tool output if summary exceeds 50 KB
      const MAX_SUMMARY_SIZE = 50 * 1024; // 50 KB
      if (result.summary && Buffer.byteLength(result.summary, "utf-8") > MAX_SUMMARY_SIZE) {
        const originalBytes = Buffer.byteLength(result.summary, "utf-8");
        // Truncate to 50 KB at character boundary
        let truncated = result.summary;
        while (Buffer.byteLength(truncated, "utf-8") > MAX_SUMMARY_SIZE) {
          truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
        }
        result.summary = `${truncated}\n\n[output truncated from ${(originalBytes / 1024).toFixed(0)} KB to 50 KB]`;
      }

      return result;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      return {
        ok: false,
        summary: `Tool "${name}" threw an error`,
        error: {
          code: "EXECUTION_ERROR",
          retryable: true,
          message,
        },
      };
    }
  }

  // ---- Internals ---------------------------------------------------------

  private _checkPermission(
    tool: ConversationTool,
    context: ToolContext,
  ): ToolResult | null {
    switch (tool.permission) {
      case "safe":
        return null; // always allowed

      case "workspace-write":
        // Always allowed, but logged (the caller can decide to log)
        return null;

      case "command":
        if (context.yolo) {
          return null; // allowed in yolo mode
        }
        return {
          ok: false,
          summary: `Tool "${tool.name}" requires approval`,
          error: {
            code: "NEEDS_APPROVAL",
            retryable: false,
            message: `Command tool "${tool.name}" needs user approval (context.yolo is false)`,
          },
        };

      case "external":
        // External tools always require approval regardless of yolo
        return {
          ok: false,
          summary: `Tool "${tool.name}" requires approval`,
          error: {
            code: "NEEDS_APPROVAL",
            retryable: false,
            message: `External tool "${tool.name}" always requires user approval`,
          },
        };

      default:
        // Fallback – treat unknown permission levels as needing approval
        return {
          ok: false,
          summary: `Tool "${tool.name}" has an unknown permission level`,
          error: {
            code: "NEEDS_APPROVAL",
            retryable: false,
            message: `Unknown permission "${tool.permission}" on tool "${tool.name}"`,
          },
        };
    }
  }
}
