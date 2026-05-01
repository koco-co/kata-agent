import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";

export class AgentRunner {
  constructor(private readonly providers: ProviderRegistry) {}

  async run(_agent: AgentManifest, _input: unknown): Promise<AgentResponse> {
    this.providers.select({ needs: ["structuredOutput"] });
    throw new Error("AgentRunner.run is implemented in v0.1b");
  }
}
