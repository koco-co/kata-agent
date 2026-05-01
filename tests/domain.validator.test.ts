import { describe, expect, test } from "bun:test";
import { validateSchema } from "../packages/domain/src/index";

describe("domain schema validator", () => {
  test("accepts valid workflow definitions", () => {
    const result = validateSchema("WorkflowDefinition", {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "create-feature-workspace", type: "artifact" }],
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("rejects invalid workflow node types", () => {
    const result = validateSchema("WorkflowDefinition", {
      id: "bad",
      version: "0.1.0",
      skill: "bad",
      nodes: [{ id: "branch", type: "branch" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "must be equal to one of the allowed values",
    );
  });
});
