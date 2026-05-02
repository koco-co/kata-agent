import { describe, expect, test } from "bun:test";
import {
  SCHEMA_REGISTRY,
  validateSchema,
  type AutomationFailureReport,
  type ConflictReport,
  type HotfixCaseGenInput,
  type InspectionReport,
  type ReportGenInput,
  type RiskPoint,
  type SourceRepoRef,
  type StaticScanInput,
} from "../packages/domain/src/index";

describe("daily QA contracts", () => {
  test("registers v0.3 daily QA schemas", () => {
    expect(SCHEMA_REGISTRY.SourceRepoRef).toBe(
      "schemas/source-repo-ref.schema.json",
    );
    expect(SCHEMA_REGISTRY.StaticScanInput).toBe(
      "schemas/static-scan-input.schema.json",
    );
    expect(SCHEMA_REGISTRY.RiskPoint).toBe("schemas/risk-point.schema.json");
    expect(SCHEMA_REGISTRY.InspectionReport).toBe(
      "schemas/inspection-report.schema.json",
    );
    expect(SCHEMA_REGISTRY.ReportGenInput).toBe(
      "schemas/report-gen-input.schema.json",
    );
    expect(SCHEMA_REGISTRY.ConflictReport).toBe(
      "schemas/conflict-report.schema.json",
    );
    expect(SCHEMA_REGISTRY.AutomationFailureReport).toBe(
      "schemas/automation-failure-report.schema.json",
    );
    expect(SCHEMA_REGISTRY.HotfixCaseGenInput).toBe(
      "schemas/hotfix-case-gen-input.schema.json",
    );
  });

  test("validates source refs, static scan input, and inspection report", () => {
    const source: SourceRepoRef = {
      schemaVersion: "0.1",
      repoId: "frontend",
      sourceRoot: "source-repos/frontend",
      branch: "main",
      commit: "abc123",
      readOnly: true,
    };
    const input: StaticScanInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: "diff --git a/app.ts b/app.ts\n+console.log('debug')\n",
    };
    const report: InspectionReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      scanner: "static-scan",
      riskPoints: [
        {
          id: "RISK-001",
          severity: "P1",
          category: "debug-code",
          title: "Debug logging added",
          description: "Added console.log can leak debug noise.",
          filePath: "app.ts",
          line: 1,
          evidence: "+console.log('debug')",
          recommendation: "Remove debug logging before release.",
        },
      ],
      scannedAt: "2026-05-02T00:00:00.000Z",
    };
    expect(validateSchema("SourceRepoRef", source).valid).toBe(true);
    expect(validateSchema("StaticScanInput", input).valid).toBe(true);
    expect(validateSchema("InspectionReport", report).valid).toBe(true);
  });

  test("validates report-gen and hotfix inputs", () => {
    const reportInput: ReportGenInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:abc",
      evidencePackRef: "EvidencePack:def",
      reviewReportRef: "ReviewReport:ghi",
    };
    const conflict: ConflictReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceReviewReportRef: "ReviewReport:ghi",
      conflicts: [
        {
          id: "CONFLICT-001",
          severity: "error",
          message: "Case misses requirement",
          artifactRef: "TestSpec:abc",
        },
      ],
      generatedAt: "2026-05-02T00:00:00.000Z",
    };
    const failure: AutomationFailureReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRunRecordRef: "RunRecord:abc",
      failedCases: [
        {
          testCaseId: "TC-001",
          status: "failed",
          failedAssertions: [
            {
              assertionId: "ASSERT-001",
              expected: "保存成功",
              actual: "保存失败",
              message: "toast mismatch",
            },
          ],
        },
      ],
      generatedAt: "2026-05-02T00:00:00.000Z",
    };
    const hotfix: HotfixCaseGenInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      issueDraftRef: "IssueDraft:abc",
      sourceRepoRef: "SourceRepoRef:def",
    };
    expect(validateSchema("ReportGenInput", reportInput).valid).toBe(true);
    expect(validateSchema("ConflictReport", conflict).valid).toBe(true);
    expect(validateSchema("AutomationFailureReport", failure).valid).toBe(true);
    expect(validateSchema("HotfixCaseGenInput", hotfix).valid).toBe(true);
  });

  test("rejects report-gen input without required artifact refs", () => {
    expect(
      validateSchema("ReportGenInput", {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
      }).valid,
    ).toBe(false);
  });

  test("rejects unsafe source roots", () => {
    const base = {
      schemaVersion: "0.1",
      repoId: "frontend",
      readOnly: true,
    } as const;

    for (const sourceRoot of [
      "/tmp/frontend",
      "../frontend",
      "./frontend",
      "source-repos/./frontend",
      "source-repos/../frontend",
      "source-repos\\frontend",
      "source-repos//frontend",
    ]) {
      expect(
        validateSchema("SourceRepoRef", {
          ...base,
          sourceRoot,
        }).valid,
      ).toBe(false);
    }
  });

  test("allows dot-dot substrings inside safe path segments", () => {
    const source: SourceRepoRef = {
      schemaVersion: "0.1",
      repoId: "frontend",
      sourceRoot: "source-repos/frontend-v1..2",
      readOnly: true,
    };
    const risk: RiskPoint = {
      id: "RISK-001",
      severity: "P2",
      category: "state-risk",
      title: "State transition risk",
      description: "File name includes a harmless double-dot substring.",
      filePath: "src/foo..bar.ts",
      evidence: "+setState(next)",
      recommendation: "Review transition coverage.",
    };
    const report: InspectionReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      scanner: "static-scan",
      riskPoints: [risk],
      scannedAt: "2026-05-02T00:00:00.000Z",
    };

    expect(validateSchema("SourceRepoRef", source).valid).toBe(true);
    expect(validateSchema("RiskPoint", risk).valid).toBe(true);
    expect(validateSchema("InspectionReport", report).valid).toBe(true);
  });

  test("rejects dot-dot traversal path segments", () => {
    const risk: RiskPoint = {
      id: "RISK-001",
      severity: "P2",
      category: "state-risk",
      title: "State transition risk",
      description: "Traversal should be rejected.",
      filePath: "src/../secret.ts",
      evidence: "+setState(next)",
      recommendation: "Use a workspace-relative source path.",
    };
    const report: InspectionReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      scanner: "static-scan",
      riskPoints: [risk],
      scannedAt: "2026-05-02T00:00:00.000Z",
    };

    expect(validateSchema("RiskPoint", risk).valid).toBe(false);
    expect(validateSchema("InspectionReport", report).valid).toBe(false);
  });

  test("rejects additional properties on daily QA schemas", () => {
    expect(
      validateSchema("SourceRepoRef", {
        schemaVersion: "0.1",
        repoId: "frontend",
        sourceRoot: "source-repos/frontend",
        readOnly: true,
        unexpected: true,
      }).valid,
    ).toBe(false);
  });
});
