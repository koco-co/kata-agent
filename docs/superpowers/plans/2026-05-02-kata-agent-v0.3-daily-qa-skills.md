# kata-agent v0.3 Daily QA Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v0.3 Daily QA Skills from the architecture spec: `hotfix-case-gen`, `report-gen`, and `static-scan`.

**Architecture:** Keep the Workflow Engine as the only flow controller for workflow skills, but implement v0.3 daily tools as explicit schema-backed CLI commands and deterministic builders first. `static-scan` is a read-only plugin over explicit source/diff inputs; `report-gen` turns existing run/review artifacts into standalone report artifacts; `hotfix-case-gen` turns reviewed issue/source context into a focused regression `TestSpec`.

**Tech Stack:** TypeScript, Bun workspaces, Bun test, Ajv JSON Schema validation, existing Artifact Repository / Plugin Runtime contracts.

---

## Scope Source

This plan implements `docs/superpowers/plans/2026-05-01-kata-agent-v0.1-foundation.md` §v0.3 Daily QA Skills:

- `hotfix-case-gen`: issue/source context -> focused regression `TestSpec`
- `report-gen`: bug report, conflict report, and automation failure report
- `static-scan`: diff/source scan -> reproducible `RiskPoint` / `InspectionReport`

Included:

- Schema-backed contracts for source repository references, static scan input/output, report-gen input/output, and hotfix-case-gen input.
- A read-only `static-scan` plugin with deterministic heuristics over diff text.
- CLI commands: `static-scan`, `report-gen`, `hotfix-case-gen`.
- Deterministic builders under `packages/workflow-engine/src/daily-qa-builders.ts`.
- Skill manifests for `report-gen`, `hotfix-case-gen`, and `static-scan`.
- Tests proving no absolute source paths, no path traversal, no source repo mutation, and no direct issue creation from static-scan findings.

Excluded:

- Mobile, desktop, and API automation.
- Autonomous issue creation from static scan findings.
- Browser/admin-console automation for issue trackers.
- LLM-backed hotfix authoring; v0.3 foundation produces a deterministic focused regression `TestSpec`.

## File Structure

- Create `packages/domain/src/daily-qa.ts`
  - Owns `SourceRepoRef`, `StaticScanInput`, `RiskPoint`, `InspectionReport`, `ReportGenInput`, `ConflictReport`, `AutomationFailureReport`, and `HotfixCaseGenInput`.
- Modify `packages/domain/src/index.ts`
  - Export daily QA contracts.
- Modify `packages/domain/src/schemas.ts`
  - Register daily QA schemas.
- Create schemas:
  - `schemas/source-repo-ref.schema.json`
  - `schemas/static-scan-input.schema.json`
  - `schemas/risk-point.schema.json`
  - `schemas/inspection-report.schema.json`
  - `schemas/report-gen-input.schema.json`
  - `schemas/conflict-report.schema.json`
  - `schemas/automation-failure-report.schema.json`
  - `schemas/hotfix-case-gen-input.schema.json`
- Modify `packages/plugin-runtime/src/types.ts`
  - Add plugin type `static-scan`.
- Modify `packages/plugin-runtime/src/constraints.ts`
  - Allow `static-scan` plugins to output `InspectionReport`.
- Create `plugins/static-scan/package.json`
- Create `plugins/static-scan/plugin.yaml`
- Create `plugins/static-scan/src/heuristics.ts`
- Create `plugins/static-scan/src/scan.ts`
- Create `packages/workflow-engine/src/daily-qa-builders.ts`
  - Build conflict reports, automation failure reports, and focused hotfix `TestSpec`.
- Modify `packages/workflow-engine/src/index.ts`
  - Export daily QA builders.
- Modify `apps/cli/src/index.ts`
  - Add `static-scan`, `report-gen`, and `hotfix-case-gen` commands.
- Create skill manifests:
  - `skills/static-scan/skill.yaml`
  - `skills/report-gen/skill.yaml`
  - `skills/hotfix-case-gen/skill.yaml`
- Modify `README.md`
  - Document v0.3 commands.
- Create tests:
  - `tests/daily-qa.contracts.test.ts`
  - `tests/static-scan-plugin.test.ts`
  - `tests/static-scan-cli.test.ts`
  - `tests/report-gen-cli.test.ts`
  - `tests/hotfix-case-gen-cli.test.ts`
- Modify tests:
  - `tests/domain.contracts.test.ts`
  - `tests/domain.validator.test.ts`
  - `tests/manifest-references.test.ts`
  - `tests/plugin-runtime.test.ts`

## Hard Constraints

- `SourceRepoRef.sourceRoot` must be relative to the kata workspace root and must reject absolute paths, `..`, `.` and empty segments.
- `static-scan` must read only explicit `diffText` or `diff-file` input and must not write into `SourceRepoRef.sourceRoot`.
- `InspectionReport.riskPoints` are advisory artifacts only; static-scan must not create `IssueDraft`.
- `hotfix-case-gen` must consume an explicit `IssueDraft` and `SourceRepoRef`; it must not consume `BugReport` directly.
- `report-gen` must consume existing artifact refs and write only under `reports/**`.
- All CLI commands must use Artifact Repository writes with allowed scopes.
- All tests that create files must use temp dirs and clean up.

## Task 1: Daily QA Domain Contracts

**Files:**

- Create: `packages/domain/src/daily-qa.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/schemas.ts`
- Create: `schemas/source-repo-ref.schema.json`
- Create: `schemas/static-scan-input.schema.json`
- Create: `schemas/risk-point.schema.json`
- Create: `schemas/inspection-report.schema.json`
- Create: `schemas/report-gen-input.schema.json`
- Create: `schemas/conflict-report.schema.json`
- Create: `schemas/automation-failure-report.schema.json`
- Create: `schemas/hotfix-case-gen-input.schema.json`
- Create: `tests/daily-qa.contracts.test.ts`

- [x] **Step 1: Write failing contract tests**

Create `tests/daily-qa.contracts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  SCHEMA_REGISTRY,
  validateSchema,
  type AutomationFailureReport,
  type ConflictReport,
  type HotfixCaseGenInput,
  type InspectionReport,
  type ReportGenInput,
  type SourceRepoRef,
  type StaticScanInput,
} from "../packages/domain/src/index";

describe("daily QA contracts", () => {
  test("registers v0.3 daily QA schemas", () => {
    expect(SCHEMA_REGISTRY.SourceRepoRef).toBe("schemas/source-repo-ref.schema.json");
    expect(SCHEMA_REGISTRY.StaticScanInput).toBe("schemas/static-scan-input.schema.json");
    expect(SCHEMA_REGISTRY.RiskPoint).toBe("schemas/risk-point.schema.json");
    expect(SCHEMA_REGISTRY.InspectionReport).toBe("schemas/inspection-report.schema.json");
    expect(SCHEMA_REGISTRY.ReportGenInput).toBe("schemas/report-gen-input.schema.json");
    expect(SCHEMA_REGISTRY.ConflictReport).toBe("schemas/conflict-report.schema.json");
    expect(SCHEMA_REGISTRY.AutomationFailureReport).toBe("schemas/automation-failure-report.schema.json");
    expect(SCHEMA_REGISTRY.HotfixCaseGenInput).toBe("schemas/hotfix-case-gen-input.schema.json");
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

  test("rejects unsafe source roots", () => {
    expect(
      validateSchema("SourceRepoRef", {
        schemaVersion: "0.1",
        repoId: "frontend",
        sourceRoot: "../frontend",
        readOnly: true,
      }).valid,
    ).toBe(false);
  });
});
```

- [x] **Step 2: Run RED**

Run:

```sh
bun test tests/daily-qa.contracts.test.ts
```

Expected: FAIL because daily QA exports and schemas do not exist.

- [x] **Step 3: Implement contracts and schemas**

Create `packages/domain/src/daily-qa.ts`:

```ts
import type { CaseRunStatus } from "./automation";

export interface SourceRepoRef {
  schemaVersion: "0.1";
  repoId: string;
  sourceRoot: string;
  branch?: string;
  commit?: string;
  readOnly: true;
}

export interface StaticScanInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRepoRef: string;
  diffText: string;
}

export type RiskSeverity = "P0" | "P1" | "P2" | "P3";

export interface RiskPoint {
  id: string;
  severity: RiskSeverity;
  category:
    | "debug-code"
    | "unsafe-code"
    | "missing-test-signal"
    | "state-risk"
    | "dependency-risk";
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  evidence: string;
  recommendation: string;
}

export interface InspectionReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRepoRef: string;
  scanner: "static-scan";
  riskPoints: RiskPoint[];
  scannedAt: string;
}

export interface ReportGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runRecordRef?: string;
  evidencePackRef?: string;
  reviewReportRef?: string;
}

export interface ConflictReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceReviewReportRef: string;
  conflicts: Array<{
    id: string;
    severity: "error" | "warning";
    message: string;
    artifactRef?: string;
  }>;
  generatedAt: string;
}

export interface AutomationFailureReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRunRecordRef: string;
  failedCases: Array<{
    testCaseId: string;
    status: CaseRunStatus;
    failedAssertions: Array<{
      assertionId: string;
      expected: string;
      actual?: string;
      message?: string;
    }>;
  }>;
  generatedAt: string;
}

export interface HotfixCaseGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  issueDraftRef: string;
  sourceRepoRef: string;
  inspectionReportRef?: string;
}
```

Modify `packages/domain/src/index.ts`:

```ts
export type {
  AutomationFailureReport,
  ConflictReport,
  HotfixCaseGenInput,
  InspectionReport,
  ReportGenInput,
  RiskPoint,
  RiskSeverity,
  SourceRepoRef,
  StaticScanInput,
} from "./daily-qa";
```

Modify `packages/domain/src/schemas.ts` by adding:

```ts
  SourceRepoRef: "schemas/source-repo-ref.schema.json",
  StaticScanInput: "schemas/static-scan-input.schema.json",
  RiskPoint: "schemas/risk-point.schema.json",
  InspectionReport: "schemas/inspection-report.schema.json",
  ReportGenInput: "schemas/report-gen-input.schema.json",
  ConflictReport: "schemas/conflict-report.schema.json",
  AutomationFailureReport: "schemas/automation-failure-report.schema.json",
  HotfixCaseGenInput: "schemas/hotfix-case-gen-input.schema.json",
```

Create schemas with closed objects, required fields from the interfaces, `additionalProperties: false`, and path-safety patterns for `project`, `feature`, `sourceRoot`, and `filePath`:

```json
{
  "type": "string",
  "minLength": 1,
  "not": {
    "anyOf": [
      { "pattern": "^/" },
      { "pattern": "^\\." },
      { "pattern": "\\.\\." },
      { "pattern": "\\\\" }
    ]
  }
}
```

- [x] **Step 4: Run GREEN**

Run:

```sh
bun test tests/daily-qa.contracts.test.ts tests/domain.contracts.test.ts tests/domain.validator.test.ts
```

Expected: PASS.

## Task 2: Static Scan Plugin And CLI

**Files:**

- Modify: `packages/plugin-runtime/src/types.ts`
- Modify: `packages/plugin-runtime/src/constraints.ts`
- Create: `plugins/static-scan/package.json`
- Create: `plugins/static-scan/plugin.yaml`
- Create: `plugins/static-scan/src/heuristics.ts`
- Create: `plugins/static-scan/src/scan.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `tests/static-scan-plugin.test.ts`
- Create: `tests/static-scan-cli.test.ts`
- Modify: `tests/plugin-runtime.test.ts`
- Modify: `tests/manifest-references.test.ts`

- [x] **Step 1: Write failing plugin and CLI tests**

Create `tests/static-scan-plugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { scanStaticDiff } from "../plugins/static-scan/src/scan";
import type { StaticScanInput } from "../packages/domain/src/index";

describe("static-scan plugin", () => {
  test("creates reproducible risk points from added diff lines", () => {
    const input: StaticScanInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: [
        "diff --git a/src/app.ts b/src/app.ts",
        "+++ b/src/app.ts",
        "+console.log('debug')",
        "+const value: any = payload",
      ].join("\n"),
    };
    const report = scanStaticDiff(input);
    expect(report.riskPoints.map((risk) => risk.category)).toEqual([
      "debug-code",
      "unsafe-code",
    ]);
    expect(report.riskPoints[0]?.filePath).toBe("src/app.ts");
  });

  test("does not turn scan findings into issue drafts", () => {
    const report = scanStaticDiff({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: "+eval(userInput)",
    });
    expect("confirmedForSync" in report).toBe(false);
    expect(report.riskPoints[0]?.category).toBe("unsafe-code");
  });
});
```

Create `tests/static-scan-cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("static-scan CLI", () => {
  test("writes source ref, input, and inspection report artifacts", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const diffPath = join(rootDir, "diff.patch");
    writeFileSync(diffPath, "diff --git a/src/app.ts b/src/app.ts\n+++ b/src/app.ts\n+console.log('debug')\n");

    const proc = Bun.spawn([
      "bun",
      "apps/cli/src/index.ts",
      "static-scan",
      "--root",
      rootDir,
      "--project",
      "demo",
      "--feature",
      "rule-config",
      "--repo-id",
      "frontend",
      "--source-root",
      "source-repos/frontend",
      "--diff-file",
      diffPath,
    ], { cwd: repoRoot, stderr: "pipe" });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output).inspectionReportPath).toBe("reports/static-scan/inspection-report.json");
    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    expect(existsSync(join(dir, "reports/static-scan/source-repo-ref.json"))).toBe(true);
    expect(readFileSync(join(dir, "reports/static-scan/inspection-report.json"), "utf8")).toContain("debug-code");
  });

  test("rejects source roots that escape the workspace", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const diffPath = join(rootDir, "diff.patch");
    writeFileSync(diffPath, "+console.log('debug')\n");
    const proc = Bun.spawn([
      "bun",
      "apps/cli/src/index.ts",
      "static-scan",
      "--root",
      rootDir,
      "--project",
      "demo",
      "--feature",
      "rule-config",
      "--repo-id",
      "frontend",
      "--source-root",
      "../frontend",
      "--diff-file",
      diffPath,
    ], { cwd: repoRoot, stderr: "pipe" });
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("SourceRepoRef");
  });
});
```

- [x] **Step 2: Run RED**

Run:

```sh
bun test tests/static-scan-plugin.test.ts tests/static-scan-cli.test.ts
```

Expected: FAIL because plugin and CLI command do not exist.

- [x] **Step 3: Implement plugin type, plugin, and CLI**

Modify `packages/plugin-runtime/src/types.ts` to include:

```ts
| "static-scan"
```

Modify `packages/plugin-runtime/src/constraints.ts`:

```ts
"static-scan": ["InspectionReport"],
```

Create `plugins/static-scan/plugin.yaml`:

```yaml
name: static-scan
title: 静态风险扫描
version: 0.1.0
type: static-scan
actions:
  - id: staticScan.scanDiff
    title: 扫描代码 diff 风险
    inputSchema: StaticScanInput
    outputSchema: InspectionReport
    sideEffects:
      network: false
      writeArtifacts: false
      external: false
permissions:
  network: none
  secrets: []
  writeScopes:
    - feature.reports
```

Create `plugins/static-scan/src/heuristics.ts` with deterministic `scanDiffLines(lines)` that emits:

- `debug-code` for `console.log`, `debugger`.
- `unsafe-code` for `eval(`, `: any`, `as any`.
- `state-risk` for `localStorage`, `sessionStorage`.
- `dependency-risk` for added `package.json` dependency lines.

Create `plugins/static-scan/src/scan.ts`:

```ts
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
```

Add CLI branch `static-scan` to `apps/cli/src/index.ts` that:

- Reads `--root`, `--project`, `--feature`, `--repo-id`, `--source-root`, and `--diff-file`.
- Creates `SourceRepoRef` with `readOnly: true`.
- Writes:
  - `reports/static-scan/source-repo-ref.json`
  - `reports/static-scan/static-scan-input.json`
  - `reports/static-scan/inspection-report.json`
- Prints `{ sourceRepoRefPath, staticScanInputPath, inspectionReportPath }`.

- [x] **Step 4: Run GREEN**

Run:

```sh
bun test tests/static-scan-plugin.test.ts tests/static-scan-cli.test.ts tests/plugin-runtime.test.ts tests/manifest-references.test.ts
```

Expected: PASS.

## Task 3: Report Gen Builders And CLI

**Files:**

- Create/modify: `packages/workflow-engine/src/daily-qa-builders.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `skills/report-gen/skill.yaml`
- Create: `tests/report-gen-cli.test.ts`

- [x] **Step 1: Write failing report-gen CLI test**

Create `tests/report-gen-cli.test.ts` that creates temp feature artifacts for `RunRecord`, `EvidencePack`, and `ReviewReport`, runs:

```sh
bun apps/cli/src/index.ts report-gen --feature-dir <feature-dir> --run-record automation/run-record.json --evidence-pack automation/evidence-pack.json --review-report test-spec/review-report.json
```

Expected outputs:

- `reports/bug-report.json`
- `reports/automation-failure-report.json`
- `reports/conflict-report.json`
- `reports/automation-report.md`

Expected JSON assertion:

```ts
expect(JSON.parse(readFileSync(join(dir, "reports/automation-failure-report.json"), "utf8")).failedCases[0].testCaseId).toBe("TC-001");
expect(JSON.parse(readFileSync(join(dir, "reports/conflict-report.json"), "utf8")).conflicts[0].message).toBe("Case misses requirement");
```

- [x] **Step 2: Run RED**

Run:

```sh
bun test tests/report-gen-cli.test.ts
```

Expected: FAIL because `report-gen` command and builders do not exist.

- [x] **Step 3: Implement builders and CLI**

Create `packages/workflow-engine/src/daily-qa-builders.ts` with:

```ts
import type {
  AutomationFailureReport,
  ConflictReport,
  EvidencePack,
  ReviewReport,
  RunRecord,
} from "../../domain/src/index";
import { buildBugReport, renderAutomationReportMarkdown } from "./artifact-builders";

export { buildBugReport, renderAutomationReportMarkdown };

export function buildAutomationFailureReport(
  runRecordRef: string,
  record: RunRecord,
): AutomationFailureReport {
  return {
    schemaVersion: "0.1",
    project: record.project,
    feature: record.feature,
    sourceRunRecordRef: runRecordRef,
    failedCases: record.caseResults
      .filter((item) => item.status === "failed" || item.status === "error")
      .map((item) => ({
        testCaseId: item.testCaseId,
        status: item.status,
        failedAssertions: item.assertionResults
          .filter((assertion) => assertion.status === "failed")
          .map((assertion) => ({
            assertionId: assertion.assertionId,
            expected: assertion.expected,
            actual: assertion.actual,
            message: assertion.message,
          })),
      })),
    generatedAt: new Date().toISOString(),
  };
}

export function buildConflictReport(
  reviewReportRef: string,
  project: string,
  feature: string,
  review: ReviewReport,
): ConflictReport {
  return {
    schemaVersion: "0.1",
    project,
    feature,
    sourceReviewReportRef: reviewReportRef,
    conflicts: review.violations.map((violation) => ({
      id: violation.id,
      severity: violation.severity,
      message: violation.message,
      artifactRef: violation.artifactRef,
    })),
    generatedAt: new Date().toISOString(),
  };
}
```

Add `report-gen` CLI branch that locates refs by path in `artifact-index.json`, reads the artifacts with schema validation, writes the four report artifacts under `reports/**`, and prints their paths.

Create `skills/report-gen/skill.yaml`:

```yaml
name: report-gen
title: 日常测试报告生成
version: 0.3.0
description: 从运行记录、证据包和审查报告生成 bug、冲突和自动化失败报告。
status: interface-only
inputs:
  schema: ReportGenInput
outputs:
  - BugReport
  - ConflictReport
  - AutomationFailureReport
requiredPlugins:
  - report
```

- [x] **Step 4: Run GREEN**

Run:

```sh
bun test tests/report-gen-cli.test.ts tests/manifest-references.test.ts
```

Expected: PASS.

## Task 4: Hotfix Case Gen Builder And CLI

**Files:**

- Modify: `packages/workflow-engine/src/daily-qa-builders.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `skills/hotfix-case-gen/skill.yaml`
- Create: `tests/hotfix-case-gen-cli.test.ts`

- [x] **Step 1: Write failing hotfix-case-gen CLI test**

Create `tests/hotfix-case-gen-cli.test.ts` that creates an `IssueDraft` and `SourceRepoRef` artifact, runs:

```sh
bun apps/cli/src/index.ts hotfix-case-gen --feature-dir <feature-dir> --issue-draft reports/issues/BUG-001.issue-draft.json --source-repo reports/static-scan/source-repo-ref.json
```

Expected output:

- `test-spec/hotfix-test-spec.json`
- `test-spec/hotfix-test-spec.md`

Expected JSON assertion:

```ts
expect(spec.modules[0].cases[0].title).toContain("保存按钮点击无响应");
expect(spec.modules[0].cases[0].automation.readiness).toBe("blocked");
expect(spec.modules[0].cases[0].requirementRefs).toEqual(["IssueDraft:abc"]);
```

- [x] **Step 2: Run RED**

Run:

```sh
bun test tests/hotfix-case-gen-cli.test.ts
```

Expected: FAIL because `hotfix-case-gen` command and builder do not exist.

- [x] **Step 3: Implement hotfix builder and CLI**

Add to `packages/workflow-engine/src/daily-qa-builders.ts`:

```ts
import type { IssueDraft, SourceRepoRef, TestSpec } from "../../domain/src/index";

export function buildHotfixTestSpec(
  issueDraftRef: string,
  issue: IssueDraft,
  source: SourceRepoRef,
): TestSpec {
  return {
    schemaVersion: "0.1",
    project: issue.project,
    feature: issue.feature,
    title: `Hotfix Regression: ${issue.title}`,
    requirementRef: issueDraftRef,
    status: "draft",
    modules: [
      {
        id: "hotfix-regression",
        name: "Hotfix Regression",
        requirementRefs: [issueDraftRef],
        cases: [
          {
            id: `HOTFIX-${issue.sourceBugId}`,
            title: issue.title,
            priority: issue.severity === "P0" ? "P0" : "P1",
            requirementRefs: [issueDraftRef],
            steps: issue.reproductionSteps.map((step, index) => ({
              id: `STEP-${String(index + 1).padStart(3, "0")}`,
              action: step,
              expected: index === issue.reproductionSteps.length - 1 ? "缺陷不再复现" : "进入下一步",
              requirementRefs: [issueDraftRef],
            })),
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L1",
                kind: "text",
                target: source.repoId,
                expected: "缺陷不再复现",
                requirementRefs: [issueDraftRef],
              },
            ],
            automation: {
              surface: "web",
              readiness: "blocked",
              uiContractRefs: [],
              blockers: [
                {
                  type: "source-context",
                  message: `Review read-only source repo ${source.repoId} at ${source.sourceRoot} before automating this hotfix case.`,
                },
              ],
            },
            traceability: {
              requirementRefs: [issueDraftRef],
              sourceRefs: [source.repoId],
            },
          },
        ],
      },
    ],
  };
}
```

Add CLI branch `hotfix-case-gen` that reads `IssueDraft` and `SourceRepoRef`, writes `test-spec/hotfix-test-spec.json` and Markdown rendered with `renderTestSpecMarkdown`, then prints both paths.

Create `skills/hotfix-case-gen/skill.yaml`:

```yaml
name: hotfix-case-gen
title: 热修复回归用例生成
version: 0.3.0
description: 从已审核 IssueDraft 和只读 SourceRepoRef 生成聚焦回归 TestSpec。
status: interface-only
inputs:
  schema: HotfixCaseGenInput
outputs:
  - TestSpec
```

- [x] **Step 4: Run GREEN**

Run:

```sh
bun test tests/hotfix-case-gen-cli.test.ts tests/manifest-references.test.ts
```

Expected: PASS.

## Task 5: Documentation And Full Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-05-02-kata-agent-v0.3-daily-qa-skills.md`

- [x] **Step 1: Document v0.3 commands**

Add README section:

```md
## v0.3 Daily QA Skills

Static scan reads explicit diff input and writes advisory inspection artifacts:

```sh
bun apps/cli/src/index.ts static-scan --root <root> --project <project> --feature <feature> --repo-id <repo> --source-root source-repos/frontend --diff-file diff.patch
```

Report generation creates bug, conflict, and automation failure reports from existing artifacts:

```sh
bun apps/cli/src/index.ts report-gen --feature-dir <feature-dir> --run-record automation/run-record.json --evidence-pack automation/evidence-pack.json --review-report test-spec/review-report.json
```

Hotfix case generation creates a focused regression TestSpec from an explicit issue draft and read-only source repo ref:

```sh
bun apps/cli/src/index.ts hotfix-case-gen --feature-dir <feature-dir> --issue-draft reports/issues/<bug-id>.issue-draft.json --source-repo reports/static-scan/source-repo-ref.json
```
```

- [x] **Step 2: Run full verification**

Run:

```sh
bun test
bun run typecheck
git diff --check
```

Expected:

- all tests pass
- TypeScript exits 0
- no whitespace errors

- [x] **Step 3: Safety scan**

Run:

```sh
rg -n "git (checkout|reset|commit|push)|writeFileSync\\([^)]*sourceRoot|rmSync\\([^)]*sourceRoot" plugins/static-scan packages apps tests
```

Expected:

- no source-repo mutation commands
- no writes/removes into `sourceRoot`
