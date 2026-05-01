import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";

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
    return {
      output: JSON.parse(response.content) as unknown,
      providerId: provider.id,
      usage: response.usage,
    };
  }
}
