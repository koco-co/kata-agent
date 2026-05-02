import type {
  AutomationFailureReport,
  ConflictReport,
  IssueDraft,
  ReviewReport,
  RunRecord,
  SourceRepoRef,
  TestSpec,
} from "../../domain/src/index";
import {
  buildBugReport,
  renderAutomationReportMarkdown,
} from "./artifact-builders";

export { buildBugReport, renderAutomationReportMarkdown };

export function buildAutomationFailureReport(
  runRecordRef: string,
  record: RunRecord,
): AutomationFailureReport {
  return {
    schemaVersion: "0.1",
    project: record.project,
    feature: record.feature,
    sourceRunRecordRef: runRecordRef,
    failedCases: record.caseResults
      .filter((item) => item.status === "failed" || item.status === "error")
      .map((item) => ({
        testCaseId: item.testCaseId,
        status: item.status,
        failedAssertions: item.assertionResults
          .filter((assertion) => assertion.status === "failed")
          .map((assertion) => ({
            assertionId: assertion.assertionId,
            expected: assertion.expected,
            ...(assertion.actual !== undefined
              ? { actual: assertion.actual }
              : {}),
            ...(assertion.message !== undefined
              ? { message: assertion.message }
              : {}),
          })),
      })),
    generatedAt: new Date().toISOString(),
  };
}

export function buildConflictReport(
  reviewReportRef: string,
  project: string,
  feature: string,
  review: ReviewReport,
): ConflictReport {
  return {
    schemaVersion: "0.1",
    project,
    feature,
    sourceReviewReportRef: reviewReportRef,
    conflicts: review.violations.map((violation) => ({
      id: violation.id,
      severity: violation.severity,
      message: violation.message,
      ...(violation.artifactRef ? { artifactRef: violation.artifactRef } : {}),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export function buildHotfixTestSpec(
  issueDraftRef: string,
  issue: IssueDraft,
  source: SourceRepoRef,
): TestSpec {
  return {
    schemaVersion: "0.1",
    project: issue.project,
    feature: issue.feature,
    title: `Hotfix Regression: ${issue.title}`,
    requirementRef: issueDraftRef,
    status: "draft",
    modules: [
      {
        id: "hotfix-regression",
        name: "Hotfix Regression",
        requirementRefs: [issueDraftRef],
        cases: [
          {
            id: `HOTFIX-${issue.sourceBugId}`,
            title: issue.title,
            priority: issue.severity,
            requirementRefs: [issueDraftRef],
            steps: issue.reproductionSteps.map((step, index) => ({
              id: `STEP-${String(index + 1).padStart(3, "0")}`,
              action: step,
              expected:
                index === issue.reproductionSteps.length - 1
                  ? "缺陷不再复现"
                  : "进入下一步",
              requirementRefs: [issueDraftRef],
            })),
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L1",
                kind: "text",
                target: source.repoId,
                expected: "缺陷不再复现",
                requirementRefs: [issueDraftRef],
              },
            ],
            automation: {
              surface: "web",
              readiness: "blocked",
              uiContractRefs: [],
              blockers: [
                {
                  type: "source-context",
                  message: `Review read-only source repo ${source.repoId} at ${source.sourceRoot} before automating this hotfix case.`,
                },
              ],
            },
            traceability: {
              requirementRefs: [issueDraftRef],
              sourceRefs: [source.repoId],
            },
          },
        ],
      },
    ],
  };
}
