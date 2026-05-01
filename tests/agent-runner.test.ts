import { describe, expect, test } from "bun:test";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type ProviderRequest,
} from "../packages/agent-runner/src/index";

describe("agent runner provider abstraction", () => {
  test("mock provider returns usage metadata", async () => {
    const provider = new MockProvider('{"ok":true}');
    const request: ProviderRequest = {
      messages: [{ role: "user", content: "hello" }],
      metadata: { agent: "source-normalizer" },
    };
    const response = await provider.generate(request);
    expect(response.content).toBe('{"ok":true}');
    expect(response.usage.durationMs).toBe(0);
    expect(provider.capabilities.structuredOutput).toBe(true);
  });

  test("mock provider can route responses by agent metadata", async () => {
    const provider = new MockProvider({
      "source-normalizer": '{"draft":true}',
      "test-spec-author": '{"spec":true}',
    });
    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      metadata: { agent: "test-spec-author" },
    });
    expect(response.content).toBe('{"spec":true}');
  });

  test("provider registry selects by capability", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider("{}"));
    expect(registry.select({ needs: ["structuredOutput"] }).id).toBe("mock");
    const runner = new AgentRunner(registry);
    expect(runner).toBeInstanceOf(AgentRunner);
  });
});
