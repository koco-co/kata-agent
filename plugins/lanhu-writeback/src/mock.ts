import type {
  LanhuWritebackDraft,
  LanhuWritebackResult,
} from "@kata-agent/domain";

export interface MockLanhuWritebackOptions {
  dryRun: boolean;
}

export async function mockWriteLanhuRequirement(
  draft: LanhuWritebackDraft,
  options: MockLanhuWritebackOptions,
): Promise<LanhuWritebackResult> {
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    provider: "lanhu",
    targetUrl: draft.targetUrl,
    status: options.dryRun ? "dry-run" : "written",
    remoteUrl: options.dryRun ? undefined : draft.targetUrl,
    message: options.dryRun ? "dry-run" : "mock written",
    writtenAt: new Date().toISOString(),
  };
}
