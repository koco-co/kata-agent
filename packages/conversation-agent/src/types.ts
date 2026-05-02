// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Core type definitions
// ---------------------------------------------------------------------------

/** Permission level required to execute a tool. */
export type ToolPermission =
  | "safe"
  | "workspace-write"
  | "command"
  | "external";

/** Named toolset that groups related tools. */
export type ToolsetName =
  | "qa-workflows"
  | "files"
  | "shell"
  | "artifacts"
  | "knowledge"
  | "external-plugins"
  | "approvals";

/** Context provided to every tool execution. */
export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  yolo: boolean;
  env: Record<string, string | undefined>;
}

/** Result returned by a tool execution. */
export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: { code: string; retryable: boolean; message: string };
}

/** A single tool available to the conversation agent. */
export interface ConversationTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: ToolPermission;
  toolset: ToolsetName;
  execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;
}

// ---- Chat message types ------------------------------------------------

/** A message from the user. */
export interface UserMessage {
  role: "user";
  content: string;
  attachments?: string[];
}

/** A message from the assistant that includes a tool call. */
export interface ToolCallMessage {
  role: "assistant";
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  isFinal?: false;
}

/** A message containing the result of a tool call. */
export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  content: string;
  result?: ToolResult;
}

/** A final assistant message (response is complete). */
export interface FinalMessage {
  role: "assistant";
  content: string;
  isFinal: true;
  toolCalls: [];
}

/** Union of all chat message shapes. */
export type ChatMessage =
  | UserMessage
  | ToolCallMessage
  | ToolResultMessage
  | FinalMessage;

// ---- Session state ----------------------------------------------------

/** The current state of a conversation session. */
export interface SessionState {
  sessionId: string;
  messages: ChatMessage[];
  project?: string;
  feature?: string;
  recentRuns?: string[];
  enabledToolsets: Set<ToolsetName>;
  yolo: boolean;
}

// ---- Slash commands ---------------------------------------------------

/** Recognised slash commands. */
export type SlashCommand =
  | "help"
  | "status"
  | "new"
  | "model"
  | "tools"
  | "yolo"
  | "exit";

// ---- Value exports (useful at runtime for iteration / validation) -----

export const ALL_TOOLSETS: ToolsetName[] = [
  "qa-workflows",
  "files",
  "shell",
  "artifacts",
  "knowledge",
  "external-plugins",
  "approvals",
];

export const ALL_PERMISSIONS: ToolPermission[] = [
  "safe",
  "workspace-write",
  "command",
  "external",
];

export const ALL_SLASH_COMMANDS: SlashCommand[] = [
  "help",
  "status",
  "new",
  "model",
  "tools",
  "yolo",
  "exit",
];
