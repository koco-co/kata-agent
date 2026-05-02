import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import { AgentRunner, ProviderRegistry } from "../packages/agent-runner/src/index";
import {
  featureDir,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { RunRecord, RunStatus, TestSpec } from "../packages/domain/src/index";
import { PluginActionRegistry } from "../packages/plugin-runtime/src/index";
import {
  createRuntimeServices,
  WorkflowExecutor,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function loadWorkflowDefinition(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(import.meta.dir, "..", "workflows", "ui-script-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

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

function writeSmokeSpec(location: {
  rootDir: string;
  project: string;
  feature: string;
}): void {
  writeJsonArtifact(
    location,
    "TestSpec",
    "test-spec/test-spec.json",
    smokeSpec(),
    "test",
    { allowedScopes: ["feature.test-spec"] },
  );
}

async function runWithPlaywrightStatus(status: Exclude<RunStatus, "passed">) {
  const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-runtime-"));
  roots.push(rootDir);
  const location = { rootDir, project: "demo", feature: "rule-config" };
  writeSmokeSpec(location);
  const actions = new PluginActionRegistry();
  actions.register("playwright.runPlan", (input) => {
    const plan = input as { project: string; feature: string };
    return {
      schemaVersion: "0.1",
      project: plan.project,
      feature: plan.feature,
      runId: `playwright-${status}`,
      runner: "playwright",
      status,
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:00:01.000Z",
      caseResults: [],
      evidenceFiles: [],
    } satisfies RunRecord;
  });
  const executor = new WorkflowExecutor({
    agentRunner: new AgentRunner(new ProviderRegistry()),
    actions,
    agents: new Map(),
  });

  const result = await executor.start({
    location,
    definition: loadWorkflowDefinition(),
    runId: `automation-run-${status}`,
    inputs: {
      testSpecPath: "test-spec/test-spec.json",
    },
  });

  return { dir: featureDir(location), result };
}

describe("ui-script-gen runtime", () => {
  test("runs mocked web automation from TestSpec to evidence pack", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-runtime-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeSmokeSpec(location);
    const { executor } = createRuntimeServices({ rootDir, mode: "mock" });

    const result = await executor.start({
      location,
      definition: loadWorkflowDefinition(),
      runId: "automation-run-1",
      inputs: {
        testSpecPath: "test-spec/test-spec.json",
        mode: "mock",
      },
    });

    expect(result.state.status).toBe("succeeded");
    const dir = featureDir(location);
    for (const path of [
      "automation/flow-spec.json",
      "automation/playwright/run-plan.json",
      "automation/playwright/generated.spec.ts",
      "automation/run-record.json",
      "automation/evidence-pack.json",
      "automation/evidence/run-log.txt",
      "reports/bug-report.json",
      "reports/html-report.json",
      "reports/automation-report.html",
      "reports/notification-result.json",
      "reports/automation-report.md",
      "traces/automation-run-1.jsonl",
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }
    const runPlan = JSON.parse(
      readFileSync(join(dir, "automation/playwright/run-plan.json"), "utf8"),
    ) as { mode: string; scriptPath: string };
    expect(runPlan.mode).toBe("mock");
    expect(existsSync(join(dir, runPlan.scriptPath))).toBe(true);
    expect(readFileSync(join(dir, runPlan.scriptPath), "utf8")).toContain(
      "await expect",
    );
    expect(
      readFileSync(join(dir, "reports/automation-report.md"), "utf8"),
    ).toContain("Automation Report");
    expect(
      readFileSync(join(dir, "reports/automation-report.html"), "utf8"),
    ).toContain("PASSED");
    const bugReport = JSON.parse(
      readFileSync(join(dir, "reports/bug-report.json"), "utf8"),
    ) as { bugs: unknown[] };
    expect(bugReport.bugs).toHaveLength(0);
  });

  test("defaults omitted mode to mock", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-ui-runtime-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeSmokeSpec(location);
    const { executor } = createRuntimeServices({ rootDir, mode: "mock" });

    const result = await executor.start({
      location,
      definition: loadWorkflowDefinition(),
      runId: "automation-run-default-mode",
      inputs: {
        testSpecPath: "test-spec/test-spec.json",
      },
    });

    expect(result.state.status).toBe("succeeded");
    const runPlan = JSON.parse(
      readFileSync(
        join(featureDir(location), "automation/playwright/run-plan.json"),
        "utf8",
      ),
    ) as { mode: string };
    expect(runPlan.mode).toBe("mock");
  });

  test("fails workflow when Playwright RunRecord fails", async () => {
    const { dir, result } = await runWithPlaywrightStatus("failed");

    expect(result.state.status).toBe("failed");
    expect(result.state.currentNode).toBe("execute-run-plan");
    expect(result.state.nodes["execute-run-plan"].status).toBe("failed");
    expect(result.state.nodes["execute-run-plan"].error).toContain(
      "Playwright run failed",
    );
    expect(existsSync(join(dir, "automation/run-record.json"))).toBe(true);
  });

  test("blocks workflow when Playwright RunRecord blocks", async () => {
    const { dir, result } = await runWithPlaywrightStatus("blocked");

    expect(result.state.status).toBe("blocked");
    expect(result.state.currentNode).toBe("execute-run-plan");
    expect(result.state.nodes["execute-run-plan"].status).toBe("blocked");
    expect(result.state.nodes["execute-run-plan"].error).toContain(
      "Playwright run blocked",
    );
    expect(existsSync(join(dir, "automation/run-record.json"))).toBe(true);
  });
});
