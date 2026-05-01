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
  });
});
