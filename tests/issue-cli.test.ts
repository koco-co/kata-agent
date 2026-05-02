import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFeatureWorkspace,
  featureDir,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { BugReport } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("issue CLI", () => {
  test("writes explicit IssueDraft artifact from BugReport", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-issue-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    const report: BugReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      bugs: [
        {
          id: "BUG-001",
          title: "保存按钮点击无响应",
          severity: "P0",
          testCaseId: "TC-001",
          flowId: "FLOW-001",
          stepId: "STEP-001",
          expected: "展示保存成功提示",
          actual: "无提示",
        },
      ],
    };
    writeJsonArtifact(
      location,
      "BugReport",
      "reports/bug-report.json",
      report,
      "test",
      {
        allowedScopes: ["feature.reports"],
      },
    );

    const dir = featureDir(location);
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "issue",
        "draft",
        "--feature-dir",
        dir,
        "--bug-report",
        "reports/bug-report.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(output).toContain("reports/issues/BUG-001.issue-draft.json");
    expect(existsSync(join(dir, "reports/issues/BUG-001.issue-draft.json"))).toBe(
      true,
    );
    const draft = JSON.parse(
      readFileSync(join(dir, "reports/issues/BUG-001.issue-draft.json"), "utf8"),
    ) as { confirmedForSync: boolean };
    expect(draft.confirmedForSync).toBe(false);
  });

  test("issue sync rejects unconfirmed draft in real non-dry-run mode", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-issue-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "IssueDraft",
      "reports/issues/BUG-001.issue-draft.json",
      {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        sourceBugReportRef: "BugReport:abc",
        sourceBugId: "BUG-001",
        title: "保存失败",
        severity: "P0",
        descriptionMarkdown: "failure",
        reproductionSteps: ["click save"],
        evidenceRefs: [],
        labels: [],
        confirmedForSync: false,
      },
      "test",
      { allowedScopes: ["feature.reports"] },
    );
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "issue",
        "sync",
        "--mode",
        "real",
        "--feature-dir",
        featureDir(location),
        "--issue-draft",
        "reports/issues/BUG-001.issue-draft.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("INVALID_INPUT IssueDraft must be confirmedForSync");
  });
});
