import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  featureDir,
  readArtifactIndex,
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

describe("v0.2 automation foundation smoke", () => {
  test("generates mocked web automation artifacts through the CLI", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-automation-"));
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
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout) as {
      runId: string;
      status: string;
      currentNode: string;
    };
    expect(output.status).toBe("succeeded");

    const index = readArtifactIndex(location);
    expect(index.artifacts.map((artifact) => artifact.type)).toEqual(
      expect.arrayContaining([
        "FlowSpec",
        "RunPlan",
        "RunRecord",
        "EvidencePack",
      ]),
    );

    const dir = featureDir(location);
    const trace = readFileSync(
      join(dir, "traces", `${output.runId}.jsonl`),
      "utf8",
    );
    expect(trace).toContain("playwright.runPlan");
    expect(
      existsSync(join(dir, "automation/playwright/generated.spec.ts")),
    ).toBe(true);
  });
});
