import { describe, expect, test } from "bun:test";
import { OpenAICompatibleProvider } from "../packages/agent-runner/src/index";

describe("OpenAICompatibleProvider", () => {
  test("posts chat completions request and returns content", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = Object.assign(
      async (...args: Parameters<typeof fetch>) => {
        const [url, init] = args;
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "{\"ok\":true}" } }],
            usage: { prompt_tokens: 3, completion_tokens: 4 },
          }),
          { status: 200 },
        );
      },
      { preconnect: () => {} },
    );
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://provider.example/v1/",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });
    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      responseFormat: "json",
      temperature: 0.2,
      maxTokens: 128,
      stopSequences: ["</json>"],
      metadata: { agent: "test" },
    });
    expect(response.content).toBe("{\"ok\":true}");
    expect(response.usage.inputTokens).toBe(3);
    expect(calls[0]?.url).toBe("https://provider.example/v1/chat/completions");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer test-key",
    });
    expect(JSON.stringify(calls[0]?.init.headers)).not.toContain("LANHU_COOKIE");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 128,
      stop: ["</json>"],
    });
  });

  test("classifies authentication errors as missing secrets", async () => {
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://provider.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: responseWithStatus(401),
    });

    await expect(
      provider.generate({
        messages: [{ role: "user", content: "hello" }],
        metadata: { agent: "test" },
      }),
    ).rejects.toThrow("MISSING_SECRET provider authentication failed: 401");
  });

  test("classifies other 4xx errors as schema validation failures", async () => {
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://provider.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: responseWithStatus(400),
    });

    await expect(
      provider.generate({
        messages: [{ role: "user", content: "hello" }],
        metadata: { agent: "test" },
      }),
    ).rejects.toThrow("SCHEMA_VALIDATION_FAILED provider request failed: 400");
  });

  test("classifies rate limits and 5xx errors as transient", async () => {
    for (const status of [429, 500]) {
      const provider = new OpenAICompatibleProvider({
        id: "test",
        baseUrl: "https://provider.example/v1",
        apiKey: "test-key",
        model: "test-model",
        fetchImpl: responseWithStatus(status),
      });

      await expect(
        provider.generate({
          messages: [{ role: "user", content: "hello" }],
          metadata: { agent: "test" },
        }),
      ).rejects.toThrow(`PROVIDER_TRANSIENT ${status}`);
    }
  });
});

function responseWithStatus(status: number): typeof fetch {
  return Object.assign(
    async () => new Response("{}", { status }),
    { preconnect: () => {} },
  );
}
