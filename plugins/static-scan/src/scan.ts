import type { InspectionReport, StaticScanInput } from "@kata-agent/domain";
import { scanDiffLines } from "./heuristics";

export function scanStaticDiff(input: StaticScanInput): InspectionReport {
  return {
    schemaVersion: "0.1",
    project: input.project,
    feature: input.feature,
    sourceRepoRef: input.sourceRepoRef,
    scanner: "static-scan",
    riskPoints: scanDiffLines(input.diffText.split(/\r?\n/)),
    scannedAt: new Date().toISOString(),
  };
}
