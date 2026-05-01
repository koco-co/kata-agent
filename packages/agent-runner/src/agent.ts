import type { ProviderSelectionHint } from "./provider-registry";

export interface AgentManifest {
  name: string;
  title: string;
  version: string;
  inputSchema: string;
  outputSchema: string;
  ownerSkill: string;
  promptPath: string;
  providerHints?: ProviderSelectionHint;
}

export interface AgentRequest {
  agent: AgentManifest;
  input: unknown;
  prompt: string;
}

export interface AgentResponse<T = unknown> {
  output: T;
  providerId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    cost?: number;
  };
}
