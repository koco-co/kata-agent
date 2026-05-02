import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  featureDir,
  readArtifactIndex,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type {
  EvidencePack,
  ReviewReport,
  RunRecord,
} from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function seedReportInputs(
  location: { rootDir: string; project: string; feature: string },
  options: {
    actual?: string;
    evidencePackRunRecordRef?: string;
  } = {},
): void {
  const runRecord: RunRecord = {
    schemaVersion: "0.1",
    project: location.project,
    feature: location.feature,
    runId: "run-001",
    runner: "playwright",
    status: "failed",
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:01:00.000Z",
    caseResults: [
      {
        testCaseId: "TC-001",
        status: "failed",
        assertionResults: [
          {
            assertionId: "ASSERT-001",
            status: "failed",
            expected: "保存成功",
            actual: options.actual ?? "保存失败",
            message: "toast mismatch",
          },
        ],
      },
    ],
    evidenceFiles: ["automation/evidence/failure.png"],
  };
  const runRecordRef = writeJsonArtifact(
    location,
    "RunRecord",
    "automation/run-record.json",
    runRecord,
    "test",
    { allowedScopes: ["feature.automation"] },
  );
  const evidencePack: EvidencePack = {
    schemaVersion: "0.1",
    project: location.project,
    feature: location.feature,
    runRecordRef: options.evidencePackRunRecordRef ?? runRecordRef.id,
    evidence: [
      {
        id: "EVID-001",
        kind: "screenshot",
        path: "automation/evidence/failure.png",
        hash: `sha256:${"a".repeat(64)}`,
      },
    ],
  };
  writeJsonArtifact(
    location,
    "EvidencePack",
    "automation/evidence-pack.json",
    evidencePack,
    "test",
    { allowedScopes: ["feature.automation"] },
  );
  const reviewReport: ReviewReport = {
    schemaVersion: "0.1",
    passed: false,
    violations: [
      {
        id: "CONFLICT-001",
        severity: "error",
        message: "Case misses requirement",
        artifactRef: "TestSpec:abc",
      },
    ],
  };
  writeJsonArtifact(
    location,
    "ReviewReport",
    "test-spec/review-report.json",
    reviewReport,
    "test",
    { allowedScopes: ["feature.test-spec"] },
  );
}

function spawnReportGen(location: {
  rootDir: string;
  project: string;
  feature: string;
}) {
  return Bun.spawn(
    [
      "bun",
      "apps/cli/src/index.ts",
      "report-gen",
      "--feature-dir",
      featureDir(location),
      "--run-record",
      "automation/run-record.json",
      "--evidence-pack",
      "automation/evidence-pack.json",
      "--review-report",
      "test-spec/review-report.json",
    ],
    { cwd: repoRoot, stderr: "pipe" },
  );
}

describe("report-gen CLI", () => {
  test("writes bug, automation failure, conflict, and markdown reports", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-report-gen-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    seedReportInputs(location);

    const proc = spawnReportGen(location);

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output)).toEqual({
      bugReportPath: "reports/bug-report.json",
      automationFailureReportPath: "reports/automation-failure-report.json",
      conflictReportPath: "reports/conflict-report.json",
      automationReportMarkdownPath: "reports/automation-report.md",
    });

    const dir = featureDir(location);
    expect(existsSync(join(dir, "reports/bug-report.json"))).toBe(true);
    expect(
      existsSync(join(dir, "reports/automation-failure-report.json")),
    ).toBe(true);
    expect(existsSync(join(dir, "reports/conflict-report.json"))).toBe(true);
    expect(existsSync(join(dir, "reports/automation-report.md"))).toBe(true);

    expect(
      JSON.parse(
        readFileSync(join(dir, "reports/automation-failure-report.json"), "utf8"),
      ).failedCases[0].testCaseId,
    ).toBe("TC-001");
    expect(
      JSON.parse(readFileSync(join(dir, "reports/conflict-report.json"), "utf8"))
        .conflicts[0].message,
    ).toBe("Case misses requirement");
    expect(readFileSync(join(dir, "reports/automation-report.md"), "utf8")).toContain(
      "# Automation Report",
    );

    const index = readArtifactIndex(location);
    expect(index.artifacts.map((artifact) => artifact.type)).toEqual(
      expect.arrayContaining([
        "BugReport",
        "AutomationFailureReport",
        "ConflictReport",
        "AutomationReportMarkdown",
      ]),
    );
  });

  test("rejects evidence packs that reference a different run record", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-report-gen-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    seedReportInputs(location, {
      evidencePackRunRecordRef: "RunRecord:different",
    });

    const proc = spawnReportGen(location);

    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("EvidencePack does not reference RunRecord");
  });

  test("preserves empty actual values in automation failure reports", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-report-gen-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    seedReportInputs(location, { actual: "" });

    const proc = spawnReportGen(location);
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);

    const report = JSON.parse(
      readFileSync(
        join(
          featureDir(location),
          "reports/automation-failure-report.json",
        ),
        "utf8",
      ),
    );
    expect(report.failedCases[0].failedAssertions[0].actual).toBe("");
  });
});
