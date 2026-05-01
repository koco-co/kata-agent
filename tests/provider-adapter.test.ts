import { describe, expect, test } from "bun:test";
import { OpenAICompatibleProvider } from "../packages/agent-runner/src/index";

describe("OpenAICompatibleProvider", () => {
  test("posts chat completions request and returns content", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl: typeof fetch = Object.assign(
      async (...args: Parameters<typeof fetch>) => {
        const [, init] = args;
        calls.push(init ?? {});
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
      baseUrl: "https://provider.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });
    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      responseFormat: "json",
      metadata: { agent: "test" },
    });
    expect(response.content).toBe("{\"ok\":true}");
    expect(response.usage.inputTokens).toBe(3);
    expect(JSON.stringify(calls[0]?.headers)).not.toContain("LANHU_COOKIE");
  });
});
