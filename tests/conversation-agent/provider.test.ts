// ---------------------------------------------------------------------------
// Provider tests
// ---------------------------------------------------------------------------

import { describe, expect, test, mock, afterEach } from "bun:test";
import { defaultProviderConfig, callProvider } from "../../packages/conversation-agent/src/provider";
import type { ChatMessage } from "../../packages/conversation-agent/src/types";

// ---------------------------------------------------------------------------
// Helper: mock Response
// ---------------------------------------------------------------------------

function mockJsonResponse(data: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(data), { status, statusText });
}

// ---------------------------------------------------------------------------
// defaultProviderConfig
// ---------------------------------------------------------------------------

describe("defaultProviderConfig", () => {
  test("returns deepseek defaults", () => {
    const cfg = defaultProviderConfig();
    expect(cfg.model).toBe("deepseek-v4-flash");
    expect(cfg.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.apiKey).toBe("");
    expect(cfg.temperature).toBe(0.7);
    expect(cfg.maxTokens).toBe(8192);
    expect(cfg.contextLength).toBe(1_048_576);
  });

  test("reads KATA_AGENT env vars", () => {
    process.env.KATA_AGENT_MODEL = "custom-model";
    process.env.KATA_AGENT_BASE_URL = "https://custom.api.com";
    process.env.KATA_AGENT_API_KEY = "sk-custom";

    const cfg = defaultProviderConfig();
    expect(cfg.model).toBe("custom-model");
    expect(cfg.baseUrl).toBe("https://custom.api.com");
    expect(cfg.apiKey).toBe("sk-custom");

    delete process.env.KATA_AGENT_MODEL;
    delete process.env.KATA_AGENT_BASE_URL;
    delete process.env.KATA_AGENT_API_KEY;
  });

  test("falls back to DEEPSEEK env vars", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-fallback";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.fallback.com";

    const cfg = defaultProviderConfig();
    expect(cfg.apiKey).toBe("sk-deepseek-fallback");
    expect(cfg.baseUrl).toBe("https://deepseek.fallback.com");

    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
  });
});

// ---------------------------------------------------------------------------
// callProvider with mocked fetch
// ---------------------------------------------------------------------------

describe("callProvider", () => {
  const config = {
    model: "test-model",
    baseUrl: "https://api.test.com",
    apiKey: "sk-test",
    temperature: 0.7,
    maxTokens: 4096,
    contextLength: 8192,
  };

  const systemPrompt = "You are a test assistant.";
  const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

  afterEach(() => {
    mock.restore();
  });

  test("returns content from provider response", async () => {
    global.fetch = mock(async () =>
      mockJsonResponse({
        choices: [{ message: { content: "Hello world" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
    );

    const result = await callProvider(config, systemPrompt, messages);

    expect(result.content).toBe("Hello world");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.finishReason).toBe("stop");
    expect(result.toolCalls).toBeUndefined();
  });

  test("passes auth header", async () => {
    let capturedHeaders: Record<string, string> = {};

    global.fetch = mock(async (_url: string, opts: any) => {
      capturedHeaders = opts.headers;
      return mockJsonResponse({
        choices: [{ message: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      });
    });

    await callProvider(config, systemPrompt, messages);

    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-test");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  test("sends proper request body", async () => {
    let capturedBody: any = null;

    global.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return mockJsonResponse({
        choices: [{ message: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      });
    });

    const tools = [{ type: "function", function: { name: "test_tool", description: "test", parameters: {} } }];
    await callProvider(config, systemPrompt, messages, tools);

    expect(capturedBody.model).toBe("test-model");
    expect(capturedBody.messages).toHaveLength(2);
    expect(capturedBody.messages[0].role).toBe("system");
    expect(capturedBody.messages[0].content).toBe(systemPrompt);
    expect(capturedBody.messages[1]).toEqual({ role: "user", content: "Hello" });
    expect(capturedBody.tools).toEqual(tools);
    expect(capturedBody.tool_choice).toBe("auto");
    expect(capturedBody.max_tokens).toBe(4096);
  });

  test("parses tool calls from response", async () => {
    global.fetch = mock(async () =>
      mockJsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "file_read", arguments: '{"path":"test.txt"}' } },
            ],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      })
    );

    const result = await callProvider(config, systemPrompt, messages);

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].id).toBe("call_1");
    expect(result.toolCalls![0].name).toBe("file_read");
    expect(result.toolCalls![0].args).toEqual({ path: "test.txt" });
    expect(result.finishReason).toBe("tool_calls");
  });

  test("sends messages without tools when no tools provided", async () => {
    let capturedBody: any = null;

    global.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return mockJsonResponse({
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      });
    });

    await callProvider(config, systemPrompt, messages);

    expect(capturedBody.tools).toBeUndefined();
  });

  test("sends correct URL", async () => {
    let capturedUrl = "";
    global.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return mockJsonResponse({
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      });
    });

    await callProvider(config, systemPrompt, messages);
    expect(capturedUrl).toBe("https://api.test.com/v1/chat/completions");
  });

  test("throws on HTTP error", async () => {
    global.fetch = mock(async () =>
      new Response('{"error": {"message": "Invalid API key"}}', { status: 401, statusText: "Unauthorized" })
    );

    const promise = callProvider(config, systemPrompt, messages);
    await expect(promise).rejects.toThrow("Provider error: 401");
  });

  test("handles empty choices", async () => {
    global.fetch = mock(async () =>
      mockJsonResponse({
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      })
    );

    const promise = callProvider(config, systemPrompt, messages);
    await expect(promise).rejects.toThrow("no choices");
  });
});
