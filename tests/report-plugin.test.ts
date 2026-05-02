import { describe, expect, test } from "bun:test";
import type { RunRecord } from "@kata-agent/domain";
import { generateHtmlReport } from "../plugins/report/src/html-renderer";

describe("report plugin", () => {
  test("generates HTML content for a passed run", () => {
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "passed",
      startedAt: "2026-05-01T00:00:00Z",
      finishedAt: "2026-05-01T00:00:10Z",
      caseResults: [
        {
          testCaseId: "TC-001",
          status: "passed",
          assertionResults: [],
        },
      ],
      evidenceFiles: [],
    };

    const html = generateHtmlReport(record);

    expect(html).toContain("<html");
    expect(html).toContain("PASSED");
  });
});
