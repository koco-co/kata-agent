import type {
  ArtifactRef,
  BugReport,
  IssueDraft,
  LanhuWritebackDraft,
  RequirementSpec,
} from "../../domain/src/index";

function issueDraftPathSafeId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function issueDraftPath(draft: IssueDraft): string {
  return `reports/issues/${issueDraftPathSafeId(draft.sourceBugId)}.issue-draft.json`;
}

export function buildIssueDraftsFromBugReport(
  bugReportRef: ArtifactRef,
  report: BugReport,
): IssueDraft[] {
  return report.bugs.map((bug) => {
    const evidenceRefs = [bug.screenshotRef, bug.consoleLogRef].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    return {
      schemaVersion: "0.1",
      project: report.project,
      feature: report.feature,
      sourceBugReportRef: bugReportRef.id,
      sourceBugId: bug.id,
      title: bug.title,
      severity: bug.severity,
      descriptionMarkdown: [
        `## ${bug.title}`,
        "",
        `- Test Case: ${bug.testCaseId}`,
        `- Flow: ${bug.flowId}`,
        `- Step: ${bug.stepId}`,
        `- Expected: ${bug.expected}`,
        `- Actual: ${bug.actual}`,
        bug.recommendation ? `- Recommendation: ${bug.recommendation}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      reproductionSteps: [
        `Run ${report.runId}`,
        `Open flow ${bug.flowId}`,
        `Execute step ${bug.stepId}`,
      ],
      evidenceRefs,
      labels: ["automation", report.feature],
      confirmedForSync: false,
    };
  });
}

export function buildLanhuWritebackDraft(
  requirementSpecRef: ArtifactRef,
  requirement: RequirementSpec,
  targetUrl: string,
): LanhuWritebackDraft {
  return {
    schemaVersion: "0.1",
    project: requirement.project,
    feature: requirement.feature,
    sourceRequirementSpecRef: requirementSpecRef.id,
    targetUrl,
    summaryMarkdown: [
      `## ${requirement.title}`,
      "",
      ...requirement.rules.map((rule) => `- ${rule.id}: ${rule.text}`),
    ].join("\n"),
    changeRefs: requirement.rules.map((rule) => rule.id),
    confirmedForWriteback: false,
  };
}
