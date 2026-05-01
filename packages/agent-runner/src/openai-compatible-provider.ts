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

  constructor(private readonly options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
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
      }),
    });
    if (!response.ok) throw new Error(`PROVIDER_TRANSIENT ${response.status}`);
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
