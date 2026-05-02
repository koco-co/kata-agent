// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Approval tool (approval.request). Requests
// user approval for an action by logging to a JSONL file and waiting for a
// timeout. In production, readline interaction would replace the timeout.
// ---------------------------------------------------------------------------
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConversationTool, ToolResult, ToolContext } from "../types";

// ---------------------------------------------------------------------------
// ApprovalLogEntry
// ---------------------------------------------------------------------------

export interface ApprovalLogEntry {
  timestamp: string;
  sessionId: string;
  action: string;
  details: string;
  decision: "pending" | "approved" | "denied" | "timeout";
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ApprovalToolOptions {
  /** Timeout in ms before auto-denying (default: 30s). */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Create the `approval.request` tool.
 *
 * - Permission: "safe" (runtime will gate review/command-permission tools;
 *   this tool itself just requests approval)
 * - Toolset: "approvals"
 *
 * Behaviour:
 * - **Non-interactive** (`process.stdin.isTTY` is falsy): immediately
 *   returns `APPROVAL_DENIED`.
 * - **Interactive**: logs the request to `{approvalDir}/{sessionId}.jsonl`,
 *   waits for `options.timeout` ms, then returns `APPROVAL_TIMEOUT`.
 *
 * In production the timeout would be replaced with actual readline-based
 * user prompting.
 */
export function createApprovalTool(
  approvalDir: string,
  options?: ApprovalToolOptions,
): ConversationTool {
  const timeoutMs = options?.timeout ?? 30_000;

  const tool: ConversationTool = {
    name: "approval_request",
    description: "Request user approval for an action",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action requiring approval",
        },
        details: {
          type: "string",
          description: "Additional details about the action",
        },
      },
      required: ["action", "details"],
    },
    permission: "safe",
    toolset: "approvals",

    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const action = String(input.action ?? "").trim();
      const details = String(input.details ?? "").trim();

      if (!action) {
        return {
          ok: false,
          summary: "Missing required parameter: action",
          error: {
            code: "INVALID_INPUT",
            retryable: false,
            message: "The 'action' parameter is required.",
          },
        };
      }

      // ---- Non-interactive: deny immediately ----
      if (!process.stdin.isTTY) {
        return {
          ok: false,
          summary: `Approval denied for action: ${action} — not in interactive mode`,
          error: {
            code: "APPROVAL_DENIED",
            retryable: false,
            message:
              "Approval cannot be obtained outside of interactive mode.",
          },
        };
      }

      // ---- Interactive: log the request ----
      ensureDir(approvalDir);
      const logPath = resolve(approvalDir, `${context.sessionId}.jsonl`);

      const entry: ApprovalLogEntry = {
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        action,
        details,
        decision: "pending",
      };
      appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");

      // ---- Wait for timeout (in production: readline prompt) ----
      await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

      // Log the timeout decision
      const timeoutEntry: ApprovalLogEntry = {
        ...entry,
        decision: "timeout",
        timestamp: new Date().toISOString(),
      };
      appendFileSync(logPath, JSON.stringify(timeoutEntry) + "\n", "utf-8");

      return {
        ok: false,
        summary: `Approval timed out for action: ${action}`,
        error: {
          code: "APPROVAL_TIMEOUT",
          retryable: true,
          message:
            "Approval request timed out waiting for user response.",
        },
      };
    },
  };

  return tool;
}
