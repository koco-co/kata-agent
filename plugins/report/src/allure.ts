import type { HtmlReport, RunRecord } from "@kata-agent/domain";
import { writeHtmlReport } from "./html-renderer";

export function generateAllureReport(record: RunRecord, featureDir: string): HtmlReport {
  return writeHtmlReport(record, featureDir);
}
