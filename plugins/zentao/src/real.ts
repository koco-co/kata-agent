import type {
  IssueDraft,
  IssueSyncResult,
} from "@kata-agent/domain";

export interface ZentaoSyncOptions {
  baseUrl?: string;
  token?: string;
  dryRun: boolean;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

function severityToZentao(severity: IssueDraft["severity"]): string {
  if (severity === "P0") return "critical";
  if (severity === "P1") return "major";
  return "minor";
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("INVALID_INPUT Zentao base URL must use https");
  }
  return url.toString().replace(/\/$/, "");
}

export async function syncIssueToZentao(
  draft: IssueDraft,
  options: ZentaoSyncOptions,
): Promise<IssueSyncResult> {
  const syncedAt = new Date().toISOString();
  if (options.dryRun) {
    return {
      schemaVersion: "0.1",
      project: draft.project,
      feature: draft.feature,
      tracker: "zentao",
      sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
      status: "dry-run",
      message: "dry-run",
      syncedAt,
    };
  }
  if (!draft.confirmedForSync) {
    throw new Error("INVALID_INPUT IssueDraft must be confirmedForSync");
  }
  if (!options.baseUrl) throw new Error("MISSING_SECRET ZENTAO_BASE_URL");
  if (!options.token) throw new Error("MISSING_SECRET ZENTAO_TOKEN");

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/api/bugs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      title: draft.title,
      severity: severityToZentao(draft.severity),
      description: draft.descriptionMarkdown,
      steps: draft.reproductionSteps,
      labels: draft.labels,
      assignee: draft.assignee,
      evidenceRefs: draft.evidenceRefs,
      project: draft.project,
      feature: draft.feature,
      sourceBugId: draft.sourceBugId,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string | number;
    url?: string;
    message?: string;
  };
  if (!response.ok || !body.id) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT Zentao ${response.status} ${body.message ?? "unknown"}`,
    );
  }
  const remotePath = body.url ?? `/bug-view-${body.id}.html`;
  const remoteUrl = remotePath.startsWith("http")
    ? remotePath
    : `${baseUrl}${remotePath.startsWith("/") ? "" : "/"}${remotePath}`;
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    tracker: "zentao",
    sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
    status: "synced",
    remoteId: String(body.id),
    remoteUrl,
    message: body.message ?? "created",
    syncedAt,
  };
}

function requireSourceIssueDraftRef(draft: IssueDraft): string {
  if (!draft.sourceIssueDraftRef) {
    throw new Error("INVALID_INPUT IssueDraft.sourceIssueDraftRef is required");
  }
  return draft.sourceIssueDraftRef;
}
