import { describe, expect, test } from "bun:test";
import type { TestSpec } from "../packages/domain/src/index";
import {
  GATE_REGISTRY,
  checkAutomationScriptReadiness,
  validateAutomationAssertions,
} from "../packages/workflow-engine/src/index";

function baseSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "draft",
    modules: [
      {
        id: "M1",
        name: "创建",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "创建规则",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "打开规则配置页面并点击新建规则",
                expected: "规则编辑表单展示名称输入框",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "text",
                target: "[data-testid='rule-form-title']",
                expected: "新建规则",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: { requirementRefs: ["REQ-001"], sourceRefs: [] },
          },
        ],
      },
    ],
  };
}

describe("automation assertion policy", () => {
  test("passes strict web-ready P0 cases with concrete assertions", () => {
    expect(validateAutomationAssertions(baseSpec()).passed).toBe(true);
  });

  test("fails ready P0 cases with vague expected text", () => {
    const spec = baseSpec();
    spec.modules[0].cases[0].assertions[0].expected = "验证功能正常";

    const result = validateAutomationAssertions(spec);

    expect(result.passed).toBe(false);
    expect(
      result.violations.some((violation) =>
        violation.message.includes("too vague"),
      ),
    ).toBe(true);
  });

  test("fails ready P0 cases with whitespace-only expected text", () => {
    const spec = baseSpec();
    spec.modules[0].cases[0].assertions[0].expected = "   ";

    const result = validateAutomationAssertions(spec);

    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) =>
          violation.message.includes("expected") ||
          violation.message.includes("concrete"),
      ),
    ).toBe(true);
  });

  test("fails non-web automation surfaces", () => {
    const spec = baseSpec();
    spec.modules[0].cases[0].automation.surface = "mobile";

    const result = validateAutomationAssertions(spec);

    expect(result.passed).toBe(false);
    expect(
      result.violations.some((violation) =>
        violation.message.includes("web-only"),
      ),
    ).toBe(true);
  });

  test("registers automation script readiness gate", () => {
    expect(GATE_REGISTRY["automation-script-readiness"]).toBeDefined();
    expect(checkAutomationScriptReadiness(baseSpec()).passed).toBe(true);
  });
});
