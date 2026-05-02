import type {
  IssueDraft,
  IssueSyncResult,
} from "@kata-agent/domain";

export interface MockZentaoOptions {
  dryRun: boolean;
}

export async function mockSyncIssueToZentao(
  draft: IssueDraft,
  options: MockZentaoOptions,
): Promise<IssueSyncResult> {
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    tracker: "zentao",
    sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
    status: options.dryRun ? "dry-run" : "synced",
    remoteId: options.dryRun ? undefined : `MOCK-${draft.sourceBugId}`,
    remoteUrl: options.dryRun
      ? undefined
      : `https://zentao.example/bug-view-${encodeURIComponent(draft.sourceBugId)}.html`,
    message: options.dryRun ? "dry-run" : "mock synced",
    syncedAt: new Date().toISOString(),
  };
}

function requireSourceIssueDraftRef(draft: IssueDraft): string {
  if (!draft.sourceIssueDraftRef) {
    throw new Error("INVALID_INPUT IssueDraft.sourceIssueDraftRef is required");
  }
  return draft.sourceIssueDraftRef;
}
