export type ExternalSeverity = "P0" | "P1" | "P2";
export type IssueSyncStatus = "dry-run" | "synced" | "failed" | "skipped";
export type LanhuWritebackStatus = "dry-run" | "written" | "failed" | "skipped";

export interface IssueDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceBugReportRef: string;
  sourceBugId: string;
  title: string;
  severity: ExternalSeverity;
  descriptionMarkdown: string;
  reproductionSteps: string[];
  evidenceRefs: string[];
  labels: string[];
  assignee?: string;
  confirmedForSync: boolean;
  sourceIssueDraftRef?: string;
}

export interface IssueSyncResult {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  tracker: "zentao";
  sourceIssueDraftRef: string;
  status: IssueSyncStatus;
  remoteId?: string;
  remoteUrl?: string;
  message: string;
  syncedAt: string;
}

export interface LanhuWritebackDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRequirementSpecRef: string;
  targetUrl: string;
  summaryMarkdown: string;
  changeRefs: string[];
  confirmedForWriteback: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface LanhuWritebackResult {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  provider: "lanhu";
  targetUrl: string;
  status: LanhuWritebackStatus;
  remoteUrl?: string;
  message: string;
  writtenAt: string;
}
