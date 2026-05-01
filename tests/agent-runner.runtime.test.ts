import { describe, expect, test } from "bun:test";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../packages/agent-runner/src/index";

describe("agent runner runtime", () => {
  test("calls selected provider and parses JSON output", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new MockProvider({
        "source-normalizer": '{"schemaVersion":"0.1","ok":true}',
      }),
    );
    const runner = new AgentRunner(registry);
    const agent: AgentManifest = {
      name: "source-normalizer",
      title: "source",
      version: "0.1.0",
      inputSchema: "RequirementSourceBundle",
      outputSchema: "RequirementDraft",
      ownerSkill: "test-case-gen",
      promptPath: "prompt.md",
    };
    const result = await runner.run(agent, { input: true }, "# 角色");
    expect(result.providerId).toBe("mock");
    expect(result.output).toEqual({ schemaVersion: "0.1", ok: true });
  });
});
