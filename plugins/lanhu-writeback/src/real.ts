import type {
  LanhuWritebackDraft,
  LanhuWritebackResult,
} from "@kata-agent/domain";

export interface LanhuWritebackOptions {
  cookie?: string;
  trustedDomains: string[];
  dryRun: boolean;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

function isTrustedLanhuHost(hostname: string, trustedDomains: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return trustedDomains.some(
    (domain) =>
      normalized === domain.toLowerCase() ||
      normalized.endsWith(`.${domain.toLowerCase()}`),
  );
}

function assertTrustedLanhuTarget(
  url: string,
  trustedDomains: string[],
): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !isTrustedLanhuHost(parsed.hostname, trustedDomains)
  ) {
    throw new Error(
      "MISSING_SECRET refusing to send Lanhu writeback cookie to untrusted host",
    );
  }
}

export async function writeLanhuRequirement(
  draft: LanhuWritebackDraft,
  options: LanhuWritebackOptions,
): Promise<LanhuWritebackResult> {
  const writtenAt = new Date().toISOString();
  if (options.dryRun) {
    return {
      schemaVersion: "0.1",
      project: draft.project,
      feature: draft.feature,
      provider: "lanhu",
      targetUrl: draft.targetUrl,
      status: "dry-run",
      message: "dry-run",
      writtenAt,
    };
  }
  if (!draft.confirmedForWriteback) {
    throw new Error(
      "INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback",
    );
  }
  if (!options.cookie) throw new Error("MISSING_SECRET LANHU_WRITEBACK_COOKIE");
  if (options.trustedDomains.length === 0) {
    throw new Error("MISSING_SECRET LANHU_WRITEBACK_ALLOWED_HOSTS");
  }
  assertTrustedLanhuTarget(draft.targetUrl, options.trustedDomains);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(draft.targetUrl, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: options.cookie,
    },
    body: JSON.stringify({
      summaryMarkdown: draft.summaryMarkdown,
      changeRefs: draft.changeRefs,
      confirmedBy: draft.confirmedBy,
      confirmedAt: draft.confirmedAt,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    message?: string;
  };
  if (!response.ok || body.ok === false) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT Lanhu writeback ${response.status} ${body.message ?? "unknown"}`,
    );
  }
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    provider: "lanhu",
    targetUrl: draft.targetUrl,
    status: "written",
    remoteUrl: body.url ?? draft.targetUrl,
    message: body.message ?? "updated",
    writtenAt,
  };
}
