import { describe, expect, test } from "bun:test";
import { validateSchema } from "@kata-agent/domain";
import type { EvidencePack, RunRecord } from "@kata-agent/domain";
import { buildBugReport } from "../packages/workflow-engine/src/bug-report-builder";
import { buildBugReport as buildBugReportFromIndex } from "../packages/workflow-engine/src/index";

const SCREENSHOT_HASH =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("bug report builder", () => {
  test("builds BugReport from failed RunRecord", () => {
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "failed",
      startedAt: "",
      finishedAt: "",
      caseResults: [
        { testCaseId: "TC-001", status: "failed", assertionResults: [] },
      ],
      evidenceFiles: ["automation/evidence/run-1/ss.png"],
    };
    const evidence: EvidencePack = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:run-1",
      evidence: [
        {
          id: "EVID-SS-1",
          kind: "screenshot",
          path: "automation/evidence/run-1/ss.png",
          hash: SCREENSHOT_HASH,
        },
      ],
    };

    const report = buildBugReport(record, evidence);

    expect(report.bugs.length).toBeGreaterThan(0);
    expect(report.bugs[0]?.severity).toBe("P0");
    expect(report.bugs[0]?.screenshotRef).toBe("EVID-SS-1");
    expect(validateSchema("BugReport", report).valid).toBe(true);
  });

  test("returns empty bugs array for passed run", () => {
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-2",
      runner: "playwright",
      status: "passed",
      startedAt: "",
      finishedAt: "",
      caseResults: [
        { testCaseId: "TC-002", status: "passed", assertionResults: [] },
      ],
      evidenceFiles: [],
    };

    const report = buildBugReport(record, {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:run-2",
      evidence: [],
    });

    expect(report.bugs).toHaveLength(0);
    expect(validateSchema("BugReport", report).valid).toBe(true);
  });

  test("exports buildBugReport from workflow engine index", () => {
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-3",
      runner: "playwright",
      status: "passed",
      startedAt: "",
      finishedAt: "",
      caseResults: [],
      evidenceFiles: [],
    };

    expect(
      buildBugReportFromIndex(record, {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        runRecordRef: "RunRecord:run-3",
        evidence: [],
      }).bugs,
    ).toHaveLength(0);
  });
});
