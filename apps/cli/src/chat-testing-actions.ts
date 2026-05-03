import type {
  TestingActionBridge,
  TestingActionId,
} from "../../../packages/conversation-agent/src/testing/tools";
import type { ToolContext, ToolResult } from "../../../packages/conversation-agent/src/types";

export interface ChatTestingActionBridgeOptions {
  workspaceRoot: string;
}

function unsupported(actionId: TestingActionId): ToolResult {
  return {
    ok: false,
    summary: `Testing action is not wired in chat mode yet: ${actionId}`,
    error: {
      code: "ACTION_NOT_WIRED",
      retryable: false,
      message: `No chat bridge handler is registered for actionId ${actionId}`,
    },
  };
}

export function createChatTestingActionBridge(
  _options: ChatTestingActionBridgeOptions,
): TestingActionBridge {
  return {
    async executeAction(
      actionId: TestingActionId,
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      if (actionId === "session.summary") {
        return {
          ok: true,
          summary: `Testing session ${context.sessionId} in ${context.workspaceRoot}`,
          data: { actionId, input },
        };
      }

      if (actionId === "session.list") {
        return {
          ok: true,
          summary: "Use /sessions to list recent conversation sessions.",
          data: { actionId },
        };
      }

      return unsupported(actionId);
    },
  };
}
