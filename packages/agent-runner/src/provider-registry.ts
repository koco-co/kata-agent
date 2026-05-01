import type { ProviderAdapter } from "./provider";

export interface ProviderSelectionHint {
  preferred?: string[];
  needs?: Array<"toolUse" | "structuredOutput" | "promptCaching" | "streaming">;
  minContextTokens?: number;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  select(hint: ProviderSelectionHint = {}): ProviderAdapter {
    const allProviders = [...this.providers.values()];
    const preferred = (hint.preferred ?? [])
      .map((id) => this.providers.get(id))
      .filter((provider): provider is ProviderAdapter => Boolean(provider));
    const candidates = [
      ...preferred,
      ...allProviders.filter((provider) => !preferred.includes(provider)),
    ];
    const provider = candidates.find((candidate) => {
      if (hint.minContextTokens) {
        if (candidate.capabilities.maxContextTokens < hint.minContextTokens) {
          return false;
        }
      }
      for (const need of hint.needs ?? []) {
        if (!candidate.capabilities[need]) return false;
      }
      return true;
    });
    if (!provider) throw new Error("No provider matches selection hint");
    return provider;
  }
}
