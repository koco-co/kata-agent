import { describe, expect, test } from "bun:test";
import type { ArtifactRef, BugReport } from "../packages/domain/src/index";
import { buildIssueDraftsFromBugReport } from "../packages/workflow-engine/src/index";

const bugReportRef: ArtifactRef = {
  id: "BugReport:abc",
  type: "BugReport",
  path: "reports/bug-report.json",
  schemaVersion: "0.1",
  createdBy: "test",
  createdAt: "2026-05-02T00:00:00.000Z",
  hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("IssueDraft builder", () => {
  test("builds explicit issue drafts from BugReport bugs", () => {
    const report: BugReport = {
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
          expected: "展示保存成功提示",
          actual: "无提示",
          screenshotRef: "EVID-SS-001",
          consoleLogRef: "EVID-CONSOLE",
          recommendation: "检查保存按钮点击事件绑定。",
        },
      ],
    };

    const drafts = buildIssueDraftsFromBugReport(bugReportRef, report);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      project: "demo",
      feature: "rule-config",
      sourceBugReportRef: "BugReport:abc",
      sourceBugId: "BUG-001",
      title: "保存按钮点击无响应",
      severity: "P0",
      evidenceRefs: ["EVID-SS-001", "EVID-CONSOLE"],
      confirmedForSync: false,
    });
    expect(drafts[0].descriptionMarkdown).toContain("TC-001");
    expect(drafts[0].descriptionMarkdown).toContain("展示保存成功提示");
    expect(drafts[0].reproductionSteps).toEqual([
      "Run run-1",
      "Open flow FLOW-001",
      "Execute step STEP-001",
    ]);
  });
});
