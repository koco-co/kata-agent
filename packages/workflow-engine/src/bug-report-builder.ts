import type { BugReport, EvidencePack, RunRecord } from "@kata-agent/domain";

export function buildBugReport(
  record: RunRecord,
  evidence: EvidencePack,
): BugReport {
  const bugs: BugReport["bugs"] = [];
  const screenshotRefs = evidence.evidence
    .filter((item) => item.kind === "screenshot")
    .map((item) => item.id);

  let index = 0;
  for (const caseResult of record.caseResults) {
    if (caseResult.status === "passed") continue;

    const screenshotRef = screenshotRefs[0];
    bugs.push({
      id: `BUG-${record.runId}-${index}`,
      title: `用例 ${caseResult.testCaseId} 执行失败`,
      severity: "P0",
      testCaseId: caseResult.testCaseId,
      flowId: "",
      stepId: "",
      expected: "",
      actual: caseResult.status,
      ...(screenshotRef ? { screenshotRef } : {}),
    });
    index++;
  }

  return {
    schemaVersion: "0.1",
    project: record.project,
    feature: record.feature,
    runId: record.runId,
    bugs,
  };
}
