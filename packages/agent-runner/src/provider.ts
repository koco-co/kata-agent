import type { JsonValue } from "../../core/src/index";

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  tools?: Array<{ name: string; description: string; inputSchema: JsonValue }>;
  toolChoice?: "auto" | "none" | { name: string };
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
  responseFormat?: "text" | "json" | { schema: string };
  cachePolicy?: "none" | "provider-default";
  metadata: Record<string, string>;
}

export interface ProviderResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    cost?: number;
  };
  raw?: JsonValue;
}

export interface ProviderAdapter {
  id: string;
  capabilities: {
    toolUse: boolean;
    structuredOutput: boolean;
    promptCaching: boolean;
    streaming: boolean;
    maxContextTokens: number;
  };
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
