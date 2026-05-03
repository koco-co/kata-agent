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
  stream?: boolean;
}

export interface AgentCallbacks {
  onStreamToken?: (token: string) => void;
  onReasoningToken?: (token: string) => void;
}

export interface AgentProcessResult {
  messages: ChatMessage[];
  finalResponse: string;
  reasoningContent?: string;
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
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? 30,
      stream: config.stream ?? false,
    };
    this.runtime = new ToolRuntime();
    this.store = new SessionStore(config.sessionDir);
    this.intent = new IntentBias();
    this.redactor = new SecretRedactor();
    this.sessionId = randomUUID();
    this.yolo = false;
    this.enabledToolsets = [...ALL_TOOLSETS];
  }

  // ---- Private helpers ---------------------------------------------------

  private getProviderConfig(callbacks?: AgentCallbacks): ProviderConfig {
    const cfg = defaultProviderConfig();
    const stream = this.config.stream ?? false;
    return {
      model: this.config.model || cfg.model,
      baseUrl: this.config.apiBase || cfg.baseUrl,
      apiKey: this.config.apiKey || cfg.apiKey,
      temperature: 0.7,
      maxTokens: 8192,
      contextLength: cfg.contextLength,
      stream,
      ...(stream && callbacks?.onStreamToken
        ? { onStreamToken: callbacks.onStreamToken }
        : {}),
      ...(stream && callbacks?.onReasoningToken
        ? { onReasoningToken: callbacks.onReasoningToken }
        : {}),
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

  private formatMaxIterationsResponse(
    maxIter: number,
    completedSteps: string[],
  ): string {
    const lines: string[] = [
      `任务尚未完成：已达到最大迭代次数（${maxIter}），模型仍未给出最终回复。`,
      "",
      "建议：",
      "1. 将任务拆成更小的步骤后继续执行。",
      "2. 如果任务卡在命令执行、文件写入或高权限工具上，请确认风险后启用 /yolo 模式再继续。",
      "",
      "已完成步骤：",
    ];

    if (completedSteps.length === 0) {
      lines.push("- 暂无可列出的已完成工具步骤。");
    } else {
      for (const step of completedSteps) {
        lines.push(`- 已执行工具：${step}`);
      }
    }

    lines.push("");
    lines.push("未完成步骤：");
    lines.push("- 模型仍未给出最终回复，可能还有后续工具调用或总结步骤未完成。");

    return lines.join("\n");
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
   * Some commands require async storage access for session metadata.
   */
  async handleSlashCommand(command: string): Promise<string> {
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();

    switch (true) {
      // /help — show system prompt with available tools
      case lower === "/help": {
        const prompt = buildSystemPrompt(
          this.runtime.listTools(),
          this.enabledToolsets,
        );
        return prompt;
      }

      // /status — show session info
      case lower === "/status": {
        const toolsets = this.enabledToolsets.join(", ");
        return [
          `## 会话状态`,
          ``,
          `**会话 ID**: ${this.sessionId}`,
          `**Yolo 模式**: ${this.yolo ? "已启用" : "已关闭"}`,
          `**已启用的工具集**: ${toolsets}`,
          `**模型**: ${this.config.model} (${this.config.provider})`,
          `**最大迭代次数**: ${this.config.maxIterations}`,
          `**工作区**: ${this.config.workspaceRoot}`,
        ].join("\n");
      }

      // /new — reset session
      case lower === "/new": {
        this.sessionId = randomUUID();
        this.yolo = false;
        return "已创建新会话，先前上下文已重置。";
      }

      // /yolo — toggle yolo mode
      case lower === "/yolo": {
        this.yolo = !this.yolo;
        return this.yolo
          ? "Yolo 模式已启用，高权限工具现已可用。"
          : "Yolo 模式已关闭，高权限工具需要审批。";
      }

      // /exit — end session
      case lower === "/exit":
        return "会话已结束。";

      // /tools — list available tools
      case lower === "/tools": {
        const tools = this.runtime.listTools();
        const lines: string[] = [];
        lines.push("## 已启用的工具集");
        lines.push("");
        lines.push(`**当前工具集**: ${this.enabledToolsets.join(", ")}`);
        lines.push("");

        if (tools.length === 0) {
          lines.push("暂无注册的工具。");
        } else {
          lines.push("### 可用工具");
          for (const t of tools) {
            const enabled = this.enabledToolsets.includes(t.toolset)
              ? "已启用"
              : "已禁用";
            lines.push(
              `  - **${t.name}** [${t.toolset}] (${t.permission}) — ${t.description} [${enabled}]`,
            );
          }
        }

        return lines.join("\n");
      }

      // /title <name> — name the current session
      case lower.startsWith("/title"): {
        const name = trimmed.slice("/title".length).trim();
        if (!name) {
          return "请提供会话名称。用法：/title <会话名称>";
        }
        await this.store.saveMetadata(this.sessionId, { name });
        return `当前会话已命名为"${name}"。`;
      }

      // /sessions — list recent sessions
      case lower === "/sessions": {
        const sessions = await this.store.getRecentSessions(10);
        if (sessions.length === 0) {
          return "暂无历史会话。";
        }
        const lines: string[] = [
          "## 最近 10 个会话",
          "",
        ];
        for (const s of sessions) {
          const name = s.name ?? "(未命名)";
          const count = s.messageCount;
          const time = new Date(s.updatedAt).toLocaleString("zh-CN");
          const yolo = s.yolo ? "Y" : "N";
          lines.push(`  \`${s.sessionId}\` ${name} — ${count} 条消息 — 更新时间 ${time} — Y[${yolo}]`);
        }
        return lines.join("\n");
      }

      // /resume <sessionId> — resume a specific session
      case lower.startsWith("/resume"): {
        const sessionId = trimmed.slice("/resume".length).trim();
        if (!sessionId) {
          return "请提供要恢复的会话 ID。用法：/resume <会话 ID>";
        }
        const metadata = await this.store.getMetadata(sessionId);
        if (!metadata) {
          return `未找到会话"${sessionId}"。`;
        }
        this.sessionId = sessionId;
        this.yolo = metadata.yolo ?? false;
        if (metadata.enabledToolsets && metadata.enabledToolsets.length > 0) {
          this.enabledToolsets = [...metadata.enabledToolsets];
        }
        const name = metadata.name ?? "(未命名)";
        return `已恢复会话"${sessionId}"（${name}），包含 ${metadata.messageCount} 条消息。yolo=${this.yolo ? "开" : "关"}，工具集=[${this.enabledToolsets.join(", ")}]。`;
      }

      default:
        return `未知命令："${command}"。输入 /help 查看可用命令。`;
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
    callbacks: AgentCallbacks = {},
  ): Promise<AgentProcessResult> {
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
    const providerConfig = this.getProviderConfig(callbacks);
    const toolSchema = this.buildToolSchema();
    const maxIter = this.config.maxIterations ?? 30;

    let finalResponse = "";
    const completedSteps: string[] = [];

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
          ...(providerResult.reasoningContent !== undefined
            ? { reasoningContent: providerResult.reasoningContent }
            : {}),
          isFinal: true,
          toolCalls: [],
        };
        await this.store.appendMessage(this.sessionId, finalMsg);

        return {
          messages: await this.store.readMessages(this.sessionId),
          finalResponse,
          ...(providerResult.reasoningContent !== undefined
            ? { reasoningContent: providerResult.reasoningContent }
            : {}),
        };
      }

      // Store assistant message with tool calls
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: providerResult.content,
        ...(providerResult.reasoningContent !== undefined
          ? { reasoningContent: providerResult.reasoningContent }
          : {}),
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
        completedSteps.push(tc.name);

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
    finalResponse = this.formatMaxIterationsResponse(maxIter, completedSteps);

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
