import type { JsonValue } from "../../core/src/index";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./provider";

export interface OpenAICompatibleProviderOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id: string;
  readonly capabilities = {
    toolUse: false,
    structuredOutput: true,
    promptCaching: false,
    streaming: false,
    maxContextTokens: 128000,
  };

  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        response_format:
          request.responseFormat === "json" || typeof request.responseFormat === "object"
            ? { type: "json_object" }
            : undefined,
        max_tokens: request.maxTokens,
        stop: request.stopSequences,
      }),
    });
    if (!response.ok) throw providerError(response.status);
    const json = (await response.json()) as JsonValue & {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("INVALID_MODEL_JSON missing content");
    return {
      content,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        durationMs: Date.now() - started,
      },
      raw: json,
    };
  }
}

function providerError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error(`MISSING_SECRET provider authentication failed: ${status}`);
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return new Error(`SCHEMA_VALIDATION_FAILED provider request failed: ${status}`);
  }
  return new Error(`PROVIDER_TRANSIENT ${status}`);
}
