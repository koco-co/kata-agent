import { describe, expect, test } from "bun:test";
import { SCHEMA_REGISTRY, validateSchema } from "../packages/domain/src/index";

function validBugReport() {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    runId: "run-1",
    bugs: [
      {
        id: "BUG-001",
        title: "保存按钮点击无响应",
        severity: "P0",
        testCaseId: "TC-001",
        flowId: "FLOW-001",
        stepId: "STEP-001",
        expected: "toast text is 保存成功",
        actual: "button click produced no visible response",
        screenshotRef: "EVID-SS-FLOW-001-STEP-001",
        consoleLogRef: "EVID-CONSOLE",
        recommendation: "检查按钮是否被遮罩层覆盖",
      },
    ],
  };
}

function validBugReportInput() {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    runId: "run-1",
    caseResults: [
      {
        testCaseId: "TC-001",
        status: "failed",
        flowTitle: "Rule config save flow",
        failedSteps: [
          {
            stepId: "STEP-001",
            action: "click save button",
            selector: "[data-testid='save-rule']",
            expected: "toast text is 保存成功",
            error: "button click produced no visible response",
            screenshotPath: "automation/evidence/run-1/save-failure.png",
            consoleLogs: ["TypeError: Cannot read properties of undefined"],
          },
        ],
      },
    ],
  };
}

describe("bug report contracts", () => {
  test("schemas are registered", () => {
    expect(SCHEMA_REGISTRY.BugReport).toBe("schemas/bug-report.schema.json");
    expect(SCHEMA_REGISTRY.BugReportInput).toBe("schemas/bug-report-input.schema.json");
  });

  test("accepts valid bug report", () => {
    expect(validateSchema("BugReport", validBugReport()).valid).toBe(true);
  });

  test("accepts valid bug report input", () => {
    expect(validateSchema("BugReportInput", validBugReportInput()).valid).toBe(
      true,
    );
  });

  test("rejects bug report input screenshot path traversal", () => {
    const input = validBugReportInput();
    input.caseResults[0].failedSteps[0].screenshotPath = "../../secret.png";

    expect(validateSchema("BugReportInput", input).valid).toBe(false);
  });

  test("rejects bug report input status typos", () => {
    const input = validBugReportInput();
    input.caseResults[0].status = "faild";

    expect(validateSchema("BugReportInput", input).valid).toBe(false);
  });

  test("rejects invalid bug severity", () => {
    const report = validBugReport();
    report.bugs[0].severity = "P9";

    expect(validateSchema("BugReport", report).valid).toBe(false);
  });

  test("rejects extra nested bug properties", () => {
    const report = validBugReport();
    (report.bugs[0] as Record<string, unknown>).internalDebugId = "debug-1";

    expect(validateSchema("BugReport", report).valid).toBe(false);
  });

  test("rejects project and feature path escapes", () => {
    expect(
      validateSchema("BugReport", {
        ...validBugReport(),
        project: "../demo",
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("BugReportInput", {
        ...validBugReportInput(),
        feature: "C:\\temp",
      }).valid,
    ).toBe(false);
  });
});
