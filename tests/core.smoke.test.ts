import { describe, expect, test } from "bun:test";
import { KataAgentError, SCHEMA_VERSION } from "../packages/core/src/index";

describe("core error", () => {
  test("derives retryability from code, not arguments", () => {
    expect(
      new KataAgentError("missing secret", "MISSING_SECRET").retryable,
    ).toBe(false);
    expect(new KataAgentError("bad json", "INVALID_MODEL_JSON").retryable).toBe(
      true,
    );
    expect(SCHEMA_VERSION).toBe("0.1");
  });
});
