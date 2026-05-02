import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HtmlReport, RunRecord } from "../../../packages/domain/src/index";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusClass(status: string): string {
  return status === "passed" ? "pass" : "fail";
}

export function generateHtmlReport(record: RunRecord): string {
  const passCount = record.caseResults.filter((result) => result.status === "passed").length;
  const failCount = record.caseResults.filter((result) => result.status === "failed").length;
  const totalCount = record.caseResults.length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(record.project)} - Automation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; color: #222; }
    h1 { margin-bottom: 0.5rem; }
    .summary { display: flex; gap: 1rem; margin: 1rem 0; }
    .pass { color: #15803d; font-weight: 700; }
    .fail { color: #b91c1c; font-weight: 700; }
    .total { color: #555; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>${escapeHtml(record.project)} / ${escapeHtml(record.feature)}</h1>
  <p>Run: ${escapeHtml(record.runId)} | ${escapeHtml(record.runner)} | ${escapeHtml(record.startedAt)}</p>
  <div class="summary">
    <span class="total">Total: ${totalCount}</span>
    <span class="pass">Passed: ${passCount}</span>
    <span class="fail">Failed: ${failCount}</span>
  </div>
  <table>
    <tr><th>Case</th><th>Status</th></tr>
    ${record.caseResults.map((result) =>
      `<tr><td>${escapeHtml(result.testCaseId)}</td><td class="${statusClass(result.status)}">${escapeHtml(result.status.toUpperCase())}</td></tr>`,
    ).join("")}
  </table>
  ${record.evidenceFiles.length > 0 ? `<h2>Evidence</h2><ul>${record.evidenceFiles.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul>` : ""}
</body>
</html>`;
}

export function writeHtmlReport(record: RunRecord, featureDir: string): HtmlReport {
  const outputPath = "reports/automation-report.html";
  const absoluteOutputPath = join(featureDir, outputPath);
  const html = generateHtmlReport(record);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, html, "utf8");
  return {
    schemaVersion: "0.1",
    format: "html",
    outputPath,
    runId: record.runId,
    status: record.status,
  };
}
