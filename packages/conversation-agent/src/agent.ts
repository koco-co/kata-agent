// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — ConversationAgent: main loop, slash
// command handling, and message processing.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import type { ChatMessage, ConversationTool, ToolsetName } from "./types";
import { ALL_TOOLSETS } from "./types";
import { ToolRuntime } from "./tool-runtime";
import { SessionStore } from "./session-store";
import { IntentBias } from "./intent";
import { SecretRedactor } from "./secret-redactor";
import { buildSystemPrompt } from "./prompts";

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------

export interface AgentConfig {
  sessionDir: string;
  workspaceRoot: string;
  model: string;
  provider: string;
  apiKey: string;
  apiBase?: string;
  maxIterations?: number;
}

// ---------------------------------------------------------------------------
// ConversationAgent
// ---------------------------------------------------------------------------

export class ConversationAgent {
  // ---- Public read-only properties ---------------------------------------

  readonly runtime: ToolRuntime;
  readonly store: SessionStore;
  readonly intent: IntentBias;
  readonly redactor: SecretRedactor;
  readonly config: Readonly<AgentConfig>;

  // ---- Mutable state -----------------------------------------------------

  sessionId: string;
  yolo: boolean;
  enabledToolsets: ToolsetName[];

  // ---- Constructor -------------------------------------------------------

  constructor(config: AgentConfig) {
    this.config = { ...config, maxIterations: config.maxIterations ?? 10 };
    this.runtime = new ToolRuntime();
    this.store = new SessionStore(config.sessionDir);
    this.intent = new IntentBias();
    this.redactor = new SecretRedactor();
    this.sessionId = randomUUID();
    this.yolo = false;
    this.enabledToolsets = [...ALL_TOOLSETS];
  }

  // ---- Tool Registration -------------------------------------------------

  /**
   * Register a tool with the runtime.
   */
  registerTool(tool: ConversationTool): void {
    this.runtime.register(tool);
  }

  // ---- Slash Commands ----------------------------------------------------

  /**
   * Handle a slash command and return a text response.
   */
  handleSlashCommand(command: string): string {
    const normalized = command.trim().toLowerCase();

    switch (normalized) {
      case "/help": {
        const prompt = buildSystemPrompt(
          this.runtime.listTools(),
          this.enabledToolsets,
        );
        return prompt;
      }

      case "/status": {
        const toolsets = this.enabledToolsets.join(", ");
        return [
          `## Session Status`,
          ``,
          `**Session ID**: ${this.sessionId}`,
          `**Yolo Mode**: ${this.yolo ? "enabled" : "disabled"}`,
          `**Enabled Toolsets**: ${toolsets}`,
          `**Model**: ${this.config.model} (${this.config.provider})`,
          `**Max Iterations**: ${this.config.maxIterations}`,
          `**Workspace**: ${this.config.workspaceRoot}`,
        ].join("\n");
      }

      case "/new": {
        this.sessionId = randomUUID();
        this.yolo = false;
        return "New session created. Previous context has been reset.";
      }

      case "/yolo": {
        this.yolo = !this.yolo;
        return this.yolo
          ? "Yolo mode enabled. Higher-permission tools are now available."
          : "Yolo mode disabled. Higher-permission tools require approval.";
      }

      case "/exit":
        return "Goodbye! Session ended.";

      case "/tools": {
        const tools = this.runtime.listTools();
        const lines: string[] = [];
        lines.push("## Enabled Toolsets");
        lines.push("");
        lines.push(`**Active toolsets**: ${this.enabledToolsets.join(", ")}`);
        lines.push("");

        if (tools.length === 0) {
          lines.push("No tools are currently registered.");
        } else {
          lines.push("### Available Tools");
          for (const t of tools) {
            const enabled = this.enabledToolsets.includes(t.toolset)
              ? "enabled"
              : "disabled";
            lines.push(
              `  - **${t.name}** [${t.toolset}] (${t.permission}) — ${t.description} [${enabled}]`,
            );
          }
        }

        return lines.join("\n");
      }

      default:
        return `Unknown command: "${command}". Try /help to see available commands.`;
    }
  }

  // ---- Message Processing ------------------------------------------------

  /**
   * Process a user message through the conversation pipeline:
   * 1. Redact secrets
   * 2. Store the user message
   * 3. Analyze intent
   * 4. Build system prompt with intent context
   * 5. Return a placeholder response
   *
   * @returns The chat messages (including user + assistant) and the final text response.
   */
  async processUserMessage(
    userMessage: string,
  ): Promise<{ messages: ChatMessage[]; finalResponse: string }> {
    // 1. Redact secrets
    const redactedMessage = this.redactor.redact(userMessage);

    // 2. Store user message
    const userMsg: ChatMessage = {
      role: "user",
      content: redactedMessage,
    };
    await this.store.appendMessage(this.sessionId, userMsg);

    // 3. Analyze intent
    const intentResult = this.intent.analyze(redactedMessage);
    const intentParts: string[] = [];
    if (intentResult.workflow) intentParts.push(`Workflow: ${intentResult.workflow}`);
    if (intentResult.project) intentParts.push(`Project: ${intentResult.project}`);
    if (intentResult.feature) intentParts.push(`Feature: ${intentResult.feature}`);
    if (intentResult.sourceUrl) intentParts.push(`Source URL: ${intentResult.sourceUrl}`);
    if (intentResult.isResume) intentParts.push("This appears to be a resume of a previous task.");
    if (intentResult.hasExternalEffects)
      intentParts.push("This task may have external effects (requires approval).");
    const intentContext =
      intentParts.length > 0 ? `Detected: ${intentParts.join("; ")}.` : undefined;

    // 4. Build system prompt with intent context
    const systemPrompt = buildSystemPrompt(
      this.runtime.listTools(),
      this.enabledToolsets,
      intentContext,
    );

    // 5. Placeholder response (real model integration will come later)
    const placeholderResponse = `I received your message and will process it using the available tools.\n\n${redactedMessage.length > 50 ? `(Your message was ${redactedMessage.length} characters long.)` : `Your message: "${redactedMessage}"`}\n\nSystem prompt built (${systemPrompt.length} chars). Intent context: ${intentContext ?? "none"}`;

    // 6. Store assistant response
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: placeholderResponse,
      isFinal: true,
      toolCalls: [],
    };
    await this.store.appendMessage(this.sessionId, assistantMsg);

    // 7. Return both the messages array and the final text
    const messages = await this.store.readMessages(this.sessionId);

    return {
      messages,
      finalResponse: placeholderResponse,
    };
  }
}
