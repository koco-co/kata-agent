import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

function writeSmokeSpec(rootDir: string): void {
  writeJsonArtifact(
    { rootDir, project: "demo", feature: "rule-config" },
    "TestSpec",
    "test-spec/test-spec.json",
    smokeSpec(),
    "test",
    { allowedScopes: ["feature.test-spec"] },
  );
}

describe("ui-script-gen real mode", () => {
  test("mock mode produces automation artifacts without a browser", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-real-"));
    roots.push(rootDir);
    writeSmokeSpec(rootDir);

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
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output).status).toBe("succeeded");
    expect(
      existsSync(
        join(
          featureDir({ rootDir, project: "demo", feature: "rule-config" }),
          "automation/run-record.json",
        ),
      ),
    ).toBe(true);
  });

  test("real mode reaches Playwright and reports missing browser as workflow failure", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-real-"));
    roots.push(rootDir);
    writeSmokeSpec(rootDir);

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
        "--mode",
        "real",
        "--browser",
        "chromium",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: join(rootDir, "empty-browsers"),
        },
        stderr: "pipe",
      },
    );

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(error).toBe("");
    const parsed = JSON.parse(output) as { status: string; currentNode: string };
    expect(parsed.status).toBe("failed");
    expect(parsed.currentNode).toBe("execute-run-plan");
  });

  test("rejects unsupported browser flag values", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-real-"));
    roots.push(rootDir);
    writeSmokeSpec(rootDir);

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
        "--browser",
        "safari",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );

    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("Invalid --browser");
  });
});
