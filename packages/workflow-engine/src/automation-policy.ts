import type { TestSpec } from "../../domain/src/index";
import type { GateResult, GateViolation } from "./gates";

const VAGUE_EXPECTATIONS = new Set([
  "验证功能正常",
  "正常",
  "成功",
  "符合预期",
  "无异常",
]);

function isReadyCriticalCase(
  testCase: TestSpec["modules"][number]["cases"][number],
): boolean {
  return (
    (testCase.priority === "P0" || testCase.priority === "P1") &&
    testCase.automation.readiness === "ready"
  );
}

export function validateAutomationAssertions(spec: TestSpec): GateResult {
  const violations: GateViolation[] = [];

  for (const module of spec.modules) {
    for (const testCase of module.cases) {
      if (testCase.automation.surface !== "web") {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "v0.2 automation is web-only",
        });
      }

      if (isReadyCriticalCase(testCase)) {
        if (
          testCase.steps.length === 0 ||
          testCase.steps.some((step) => step.action.trim() === "")
        ) {
          violations.push({
            id: testCase.id,
            severity: "error",
            message: "Ready P0/P1 case must have executable steps",
          });
        }

        if (testCase.assertions.length === 0) {
          violations.push({
            id: testCase.id,
            severity: "error",
            message: "Ready P0/P1 case must have concrete assertions",
          });
        }
      }

      for (const assertion of testCase.assertions) {
        const expected = assertion.expected.trim();
        if (expected === "") {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Assertion expected value must be concrete",
          });
        }

        if (VAGUE_EXPECTATIONS.has(expected)) {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Assertion expected value is too vague",
          });
        }

        if (assertion.target.trim() === "") {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Assertion target must be non-empty",
          });
        }

        if (assertion.requirementRefs.length === 0) {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Assertion requirementRefs must be preserved/non-empty",
          });
        }
      }
    }
  }

  return { passed: violations.length === 0, violations };
}
