import type { CaseRunStatus } from "./automation";

export interface SourceRepoRef {
  schemaVersion: "0.1";
  repoId: string;
  sourceRoot: string;
  branch?: string;
  commit?: string;
  readOnly: true;
}

export interface StaticScanInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRepoRef: string;
  diffText: string;
}

export type RiskSeverity = "P0" | "P1" | "P2" | "P3";

export interface RiskPoint {
  id: string;
  severity: RiskSeverity;
  category:
    | "debug-code"
    | "unsafe-code"
    | "missing-test-signal"
    | "state-risk"
    | "dependency-risk";
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  evidence: string;
  recommendation: string;
}

export interface InspectionReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRepoRef: string;
  scanner: "static-scan";
  riskPoints: RiskPoint[];
  scannedAt: string;
}

export interface ReportGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runRecordRef: string;
  evidencePackRef: string;
  reviewReportRef: string;
}

export interface ConflictReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceReviewReportRef: string;
  conflicts: Array<{
    id: string;
    severity: "error" | "warning";
    message: string;
    artifactRef?: string;
  }>;
  generatedAt: string;
}

export interface AutomationFailureReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRunRecordRef: string;
  failedCases: Array<{
    testCaseId: string;
    status: CaseRunStatus;
    failedAssertions: Array<{
      assertionId: string;
      expected: string;
      actual?: string;
      message?: string;
    }>;
  }>;
  generatedAt: string;
}

export interface HotfixCaseGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  issueDraftRef: string;
  sourceRepoRef: string;
  inspectionReportRef?: string;
}
