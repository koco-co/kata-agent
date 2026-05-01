import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { RunPlan } from "../packages/domain/src/index";
import { validateSchema } from "../packages/domain/src/index";
import {
  artifactPath,
  readArtifactIndex,
} from "../packages/artifact-repo/src/index";
import { mockRunPlan } from "../plugins/playwright/src/mock";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runPlan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    runner: "playwright",
    mode: "mock",
    sourceFlowSpecRef: "FlowSpec:demo",
    scriptPath: "automation/playwright/generated.spec.ts",
    flows: [
      {
        flowId: "FLOW-001",
        testCaseId: "TC-001",
        title: "保存规则",
        entryUrl: "https://example.test/rules",
        steps: [
          {
            id: "STEP-001",
            action: "click",
            selector: "[data-testid=save]",
            expected: "保存成功",
          },
        ],
        assertions: [
          {
            id: "ASSERT-001",
            layer: "L3",
            kind: "text",
            selector: "[role=status]",
            expected: "保存成功",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("Playwright mock runner", () => {
  test("writes deterministic evidence and returns a passed run record", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const input = runPlan();

    const output = await mockRunPlan(input, {
      rootDir,
      project: "demo",
      feature: "rule-config",
    });

    const evidencePath = artifactPath(
      { rootDir, project: "demo", feature: "rule-config" },
      "automation/evidence/run-log.txt",
    );
    expect(existsSync(evidencePath)).toBe(true);
    expect(readFileSync(evidencePath, "utf8")).toContain("TC-001 passed");
    expect(
      readArtifactIndex({
        rootDir,
        project: "demo",
        feature: "rule-config",
      }).artifacts.map((artifact) => artifact.path),
    ).toContain("automation/evidence/run-log.txt");
    expect(output).toMatchObject({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runner: "playwright",
      status: "passed",
      evidenceFiles: ["automation/evidence/run-log.txt"],
    });
    expect(output.runId).toStartWith("playwright-");
    expect(output.caseResults).toEqual([
      {
        testCaseId: "TC-001",
        status: "passed",
        assertionResults: [
          {
            assertionId: "ASSERT-001",
            status: "passed",
            expected: "保存成功",
            actual: "保存成功",
          },
        ],
      },
    ]);
    expect(validateSchema("RunRecord", output).valid).toBe(true);
  });

  test("rejects non-playwright plans", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    await expect(
      mockRunPlan(
        runPlan({ runner: "other" as RunPlan["runner"] }),
        { rootDir, project: "demo", feature: "rule-config" },
      ),
    ).rejects.toThrow("INVALID_INPUT runner must be playwright");
  });
});
