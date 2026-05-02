import type { HtmlReport, RunRecord } from "../../../packages/domain/src/index";
import { writeHtmlReport } from "./html-renderer";

export function generateAllureReport(record: RunRecord, featureDir: string): HtmlReport {
  return writeHtmlReport(record, featureDir);
}
