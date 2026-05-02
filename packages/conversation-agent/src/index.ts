// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Public API
// ---------------------------------------------------------------------------

export {
  ALL_TOOLSETS,
  ALL_PERMISSIONS,
  ALL_SLASH_COMMANDS,
} from "./types";

export type {
  ToolPermission,
  ToolsetName,
  ToolContext,
  ToolResult,
  ConversationTool,
  UserMessage,
  ToolCallMessage,
  ToolResultMessage,
  FinalMessage,
  ChatMessage,
  SessionState,
  SlashCommand,
} from "./types";

export { ConversationAgent } from "./agent";
export type { AgentConfig } from "./agent";

export { SessionStore } from "./session-store";
export type { SessionStoreOptions } from "./session-store";

export { ToolRuntime } from "./tool-runtime";

export { IntentBias } from "./intent";
export type { IntentResult } from "./intent";

export { SecretRedactor } from "./secret-redactor";

export { callProvider, defaultProviderConfig } from "./provider";
export type { ProviderConfig, ProviderResponse } from "./provider";
