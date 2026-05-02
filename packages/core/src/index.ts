export { SCHEMA_VERSION } from "./version";
export type { SchemaVersion } from "./version";
export {
  KATA_AGENT_ERROR_CODES,
  isRetryable,
  type KataAgentErrorCode,
} from "./error-code";
export type { ConfigLoader } from "./config";
export { LocalConfigLoader, type LocalConfigLoaderOptions } from "./config-loader";
export {
  DEFAULT_HARD_RULES,
  loadRuleSet,
  type HardRule,
  type HardRuleSource,
  type LoadRuleSetOptions,
  type RuleSet,
} from "./rule-store";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

import { isRetryable, type KataAgentErrorCode } from "./error-code";

export class KataAgentError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly code: KataAgentErrorCode,
  ) {
    super(message);
    this.name = "KataAgentError";
    this.retryable = isRetryable(code);
  }
}
