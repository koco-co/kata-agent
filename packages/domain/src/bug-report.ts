import type { CaseRunStatus } from "./automation";

export interface BugReportInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  caseResults: Array<{
    testCaseId: string;
    status: CaseRunStatus;
    flowTitle: string;
    failedSteps: Array<{
      stepId: string;
      action: string;
      selector: string;
      expected: string;
      error: string;
      screenshotPath?: string;
      consoleLogs?: string[];
    }>;
  }>;
}

export interface BugReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  bugs: Array<{
    id: string;
    title: string;
    severity: "P0" | "P1" | "P2";
    testCaseId: string;
    flowId: string;
    stepId: string;
    expected: string;
    actual: string;
    screenshotRef?: string;
    consoleLogRef?: string;
    recommendation?: string;
  }>;
}
