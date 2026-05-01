import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
} from "./provider";

export type MockProviderResponder =
  | string
  | Record<string, string>
  | ((request: ProviderRequest) => string | Promise<string>);

export class MockProvider implements ProviderAdapter {
  readonly id = "mock";
  readonly capabilities = {
    toolUse: false,
    structuredOutput: true,
    promptCaching: false,
    streaming: false,
    maxContextTokens: 128000,
  };

  constructor(private readonly responder: MockProviderResponder) {}

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const agent = request.metadata.agent;
    const content =
      typeof this.responder === "function"
        ? await this.responder(request)
        : typeof this.responder === "string"
          ? this.responder
          : (this.responder[agent] ?? this.responder.default ?? "{}");
    return {
      content,
      usage: { inputTokens: 0, outputTokens: 0, durationMs: 0 },
    };
  }
}
