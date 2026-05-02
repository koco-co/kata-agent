import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  featureDir,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { TestSpec } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function smokeSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "Rule Config Automation",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "module-rules",
        name: "Rules",
        requirementRefs: ["REQ-1"],
        cases: [
          {
            id: "case-save-rule",
            title: "Save a rule",
            priority: "P0",
            requirementRefs: ["REQ-1"],
            steps: [
              {
                id: "step-click-save",
                action: "click button:Save",
                expected: "Saved",
                requirementRefs: ["REQ-1"],
              },
            ],
            assertions: [
              {
                id: "assert-success-copy",
                layer: "L3",
                kind: "text",
                target: "text=Saved",
                expected: "Saved",
                requirementRefs: ["REQ-1"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-1"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-1"],
              sourceRefs: ["SRC-1"],
            },
          },
        ],
      },
    ],
  };
}

describe("ui-script-gen cli", () => {
  test("runs mocked web automation and writes evidence/report artifacts", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-cli-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      smokeSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "ui-script-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--test-spec",
        "test-spec/test-spec.json",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(error).toBe("");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output) as {
      runId: string;
      status: string;
      currentNode: string;
    };
    expect(parsed.status).toBe("succeeded");
    expect(parsed.currentNode).toBe("write-automation-report");

    const dir = featureDir(location);
    expect(existsSync(join(dir, "automation/evidence-pack.json"))).toBe(true);
    const reportPath = join(dir, "reports/automation-report.md");
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, "utf8")).toContain("Automation Report");
    expect(existsSync(join(dir, "reports/automation-report.html"))).toBe(true);
    expect(existsSync(join(dir, "reports/notification-result.json"))).toBe(true);
  });

  test("rejects schema-invalid test spec path at the CLI boundary", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-cli-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/alt.json",
      smokeSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "ui-script-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--test-spec",
        "test-spec/alt.json",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(error).toContain("SCHEMA_VALIDATION_FAILED UiScriptGenInput");
  });

  test("resumes ui-script-gen runs using the persisted workflow id", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-cli-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      smokeSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );

    const start = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "ui-script-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--test-spec",
        "test-spec/test-spec.json",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const startOutput = await new Response(start.stdout).text();
    const startError = await new Response(start.stderr).text();
    expect(await start.exited, startError).toBe(0);
    const started = JSON.parse(startOutput) as {
      runId: string;
      status: string;
    };
    expect(started.status).toBe("succeeded");

    const resume = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "workflow",
        "resume",
        "--feature-dir",
        featureDir(location),
        "--run",
        started.runId,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const resumeOutput = await new Response(resume.stdout).text();
    const resumeError = await new Response(resume.stderr).text();
    expect(await resume.exited, resumeError).toBe(0);
    const resumed = JSON.parse(resumeOutput) as {
      status: string;
      currentNode: string;
    };
    expect(resumed.status).toBe("succeeded");
    expect(resumed.currentNode).toBe("write-automation-report");
  });
});
