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

  test("rejects malformed RequirementSpec nested items", () => {
    const result = validateSchema("RequirementSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "Rule Config",
      status: "confirmed",
      rules: ["not-a-rule"],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/rules/0");
  });

  test("rejects invalid ConfirmationResult answer status", () => {
    const result = validateSchema("ConfirmationResult", {
      schemaVersion: "0.1",
      answers: [
        { questionId: "GAP-001", status: "accepted", answer: "保存" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/answers/0/status");
  });

  test("rejects RequirementSpec project path escapes", () => {
    const result = validateSchema("RequirementSpec", {
      schemaVersion: "0.1",
      project: "../outside",
      feature: "rule-config",
      title: "Rule Config",
      status: "confirmed",
      rules: [],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/project");
  });

  test("rejects malformed TestSpec nested items", () => {
    const result = validateSchema("TestSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "Rule Config Test Spec",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: ["not-a-module"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/modules/0");
  });
});
