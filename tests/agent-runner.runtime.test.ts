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
        "source-normalizer":
          '{"schemaVersion":"0.1","project":"demo","feature":"rule-config","title":"规则配置","facts":[]}',
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
    expect(result.output).toEqual({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      facts: [],
    });
  });

  test("rejects provider JSON that does not match agent output schema", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new MockProvider({
        "source-normalizer": '{"schemaVersion":"0.1"}',
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

    await expect(runner.run(agent, { input: true }, "# 角色")).rejects.toThrow(
      "SCHEMA_VALIDATION_FAILED RequirementDraft",
    );
  });
});
