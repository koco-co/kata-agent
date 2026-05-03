// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — OpenAI-compatible provider client
// ---------------------------------------------------------------------------

import type { ChatMessage } from "./types";

// ---------------------------------------------------------------------------
// ProviderConfig
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  contextLength?: number;
}

// ---------------------------------------------------------------------------
// Default config from Hermes Agent settings
// ---------------------------------------------------------------------------

export function defaultProviderConfig(): ProviderConfig {
  return {
    model: process.env.KATA_AGENT_MODEL ?? "deepseek-v4-flash",
    baseUrl:
      process.env.KATA_AGENT_BASE_URL ??
      process.env.DEEPSEEK_BASE_URL ??
      "https://api.deepseek.com",
    apiKey:
      process.env.KATA_AGENT_API_KEY ??
      process.env.DEEPSEEK_API_KEY ??
      "",
    temperature: 0.7,
    maxTokens: 8192,
    contextLength: 1_048_576,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProviderResponse {
  content: string;
  reasoningContent?: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: "stop" | "length" | "tool_calls" | "error";
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Call the model provider (OpenAI-compatible chat completions API).
 */
export async function callProvider(
  config: ProviderConfig,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: Array<Record<string, unknown>>,
): Promise<ProviderResponse> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map(serializeMessage),
    ],
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 8192,
    stream: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(no body)");
    throw new Error(
      `Provider error: ${response.status} ${response.statusText}\n${errorBody.slice(0, 500)}`,
    );
  }

  const json: any = await response.json();
  const choice = json.choices?.[0];

  if (!choice) {
    throw new Error("Provider returned no choices");
  }

  // Parse tool calls if present
  const rawToolCalls = choice.message?.tool_calls;
  const toolCalls = rawToolCalls?.map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name ?? "",
    args: (() => {
      try {
        return JSON.parse(tc.function?.arguments ?? "{}");
      } catch {
        return {};
      }
    })(),
  }));

  return {
    content: choice.message?.content ?? "",
    reasoningContent: choice.message?.reasoning_content ?? undefined,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    finishReason: choice.finish_reason ?? "error",
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === "user") {
    return { role: "user", content: msg.content };
  }

  if (msg.role === "assistant") {
    const serialized: Record<string, unknown> = {
      role: "assistant",
      content: msg.content,
    };

    if (msg.reasoningContent !== undefined) {
      serialized.reasoning_content = msg.reasoningContent;
    }

    if ("toolCalls" in msg && msg.toolCalls && msg.toolCalls.length > 0) {
      serialized.content = msg.content || null;
      serialized.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args ?? {}),
        },
      }));
    }

    return serialized;
  }

  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.toolCallId,
      content: msg.content ?? "",
    };
  }

  // Fallback
  return { role: "user", content: JSON.stringify(msg) };
}
