// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — ConversationAgent: main loop, slash
// command handling, and message processing with real model provider.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import type { ChatMessage, ConversationTool, ToolsetName, ToolCallMessage, ToolResultMessage } from "./types";
import { ALL_TOOLSETS } from "./types";
import { ToolRuntime } from "./tool-runtime";
import { SessionStore } from "./session-store";
import { IntentBias } from "./intent";
import { SecretRedactor } from "./secret-redactor";
import { buildSystemPrompt } from "./prompts";
import { callProvider, defaultProviderConfig, type ProviderConfig, type ProviderResponse } from "./provider";

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

  // ---- Private helpers ---------------------------------------------------

  private getProviderConfig(): ProviderConfig {
    const cfg = defaultProviderConfig();
    return {
      model: this.config.model || cfg.model,
      baseUrl: this.config.apiBase || cfg.baseUrl,
      apiKey: this.config.apiKey || cfg.apiKey,
      temperature: 0.7,
      maxTokens: 8192,
      contextLength: cfg.contextLength,
    };
  }

  private buildToolSchema(): Array<Record<string, unknown>> {
    return this.runtime.listTools()
      .filter(t => this.enabledToolsets.includes(t.toolset))
      .map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
  }

  private formatProviderError(err: unknown): string {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = this.redactor.redact(rawMessage);
    const normalized = message.toLowerCase();

    if (
      normalized.includes("401") ||
      normalized.includes("403") ||
      normalized.includes("unauthorized") ||
      normalized.includes("api key")
    ) {
      return [
        "模型服务认证失败。请检查 DEEPSEEK_API_KEY 是否已正确设置，然后重试。",
        "",
        `错误详情：${message}`,
      ].join("\n");
    }

    if (
      normalized.includes("fetch failed") ||
      normalized.includes("network") ||
      normalized.includes("timeout") ||
      normalized.includes("econn") ||
      normalized.includes("enotfound")
    ) {
      return [
        "无法连接模型服务。请检查网络连接和 DEEPSEEK_BASE_URL 后重试。",
        "",
        `错误详情：${message}`,
      ].join("\n");
    }

    return [
      "调用模型服务时出错。请稍后重试，或检查 DEEPSEEK_API_KEY 和模型服务配置。",
      "",
      `错误详情：${message}`,
    ].join("\n");
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
   * 5. Call the model provider with tools
   * 6. Execute returned tool calls (loop up to maxIterations)
   * 7. Return the final response
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

    // 5-6. Call provider and loop for tool calls
    const providerConfig = this.getProviderConfig();
    const toolSchema = this.buildToolSchema();
    const maxIter = this.config.maxIterations ?? 10;

    let finalResponse = "";

    for (let iteration = 0; iteration < maxIter; iteration++) {
      // Read messages from session store
      const messages = await this.store.readMessages(this.sessionId);

      // Call provider
      console.log("正在请求模型，请稍候...");
      let providerResult: ProviderResponse;
      try {
        providerResult = await callProvider(
          providerConfig,
          systemPrompt,
          messages,
          toolSchema.length > 0 ? toolSchema : undefined,
        );
        console.log("模型响应完成。");
      } catch (err: unknown) {
        console.log("模型请求失败。");
        finalResponse = this.formatProviderError(err);

        const finalMsg: ChatMessage = {
          role: "assistant",
          content: finalResponse,
          isFinal: true,
          toolCalls: [],
        };
        await this.store.appendMessage(this.sessionId, finalMsg);

        return {
          messages: await this.store.readMessages(this.sessionId),
          finalResponse,
        };
      }

      // Parse response for tool calls
      const toolCalls = providerResult.toolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls — this is the final response
        finalResponse = providerResult.content;

        const finalMsg: ChatMessage = {
          role: "assistant",
          content: finalResponse,
          isFinal: true,
          toolCalls: [],
        };
        await this.store.appendMessage(this.sessionId, finalMsg);

        return {
          messages: await this.store.readMessages(this.sessionId),
          finalResponse,
        };
      }

      // Store assistant message with tool calls
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: providerResult.content,
        toolCalls: toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
        })),
      };
      await this.store.appendMessage(this.sessionId, assistantMsg);

      // Execute each tool call
      const context = {
        workspaceRoot: this.config.workspaceRoot,
        sessionId: this.sessionId,
        yolo: this.yolo,
        env: {},
      };

      for (const tc of toolCalls) {
        const toolResult = await this.runtime.execute(tc.name, tc.args, context);

        // Redact secrets in tool results
        const redactedSummary = this.redactor.redact(toolResult.summary);

        const resultMsg: ChatMessage = {
          role: "tool",
          toolCallId: tc.id,
          content: redactedSummary,
          result: toolResult,
        };
        await this.store.appendMessage(this.sessionId, resultMsg);
      }
    }

    // Max iterations reached without final response
    finalResponse = `I've reached the maximum number of iterations (${maxIter}) processing your request. Some operations may not have completed. Please try breaking your request into smaller steps.`;

    const finalMsg: ChatMessage = {
      role: "assistant",
      content: finalResponse,
      isFinal: true,
      toolCalls: [],
    };
    await this.store.appendMessage(this.sessionId, finalMsg);

    return {
      messages: await this.store.readMessages(this.sessionId),
      finalResponse,
    };
  }
}
