import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";
import {
  assertValidSchema,
  type SchemaName,
} from "../../domain/src/index";

export class AgentRunner {
  constructor(private readonly providers: ProviderRegistry) {}

  async run(
    agent: AgentManifest,
    input: unknown,
    prompt = "",
  ): Promise<AgentResponse> {
    const provider = this.providers.select({
      ...agent.providerHints,
      needs: [...(agent.providerHints?.needs ?? []), "structuredOutput"],
    });
    const response = await provider.generate({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(input) },
      ],
      responseFormat: { schema: agent.outputSchema },
      metadata: { agent: agent.name, outputSchema: agent.outputSchema },
    });
    let output: unknown;
    try {
      output = JSON.parse(response.content) as unknown;
    } catch {
      throw new Error(`INVALID_MODEL_JSON ${agent.name}`);
    }
    assertValidSchema(agent.outputSchema as SchemaName, output);
    return {
      output,
      providerId: provider.id,
      usage: response.usage,
    };
  }
}
