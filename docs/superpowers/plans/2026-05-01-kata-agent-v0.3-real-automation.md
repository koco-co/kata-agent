# kata-agent v0.3 Real Browser Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the v0.2 mocked Playwright plugin with a real browser driver, produce real RunRecords and EvidencePacks with screenshots, add self-healing retry logic, generate structured bug reports, and integrate Allure HTML reporting.

**Architecture:** Keep the Workflow Engine as the only flow controller. The v0.2 `playwright.runPlan` mock action is replaced by a real Playwright driver that installs browsers, executes generated `.spec.ts` scripts against real URLs, captures screenshots/console logs, and produces real RunRecord + EvidencePack artifacts. A new `notify` plugin and `bug-report` skill handle post-run notification and structured bug reporting. Self-healing wraps the driver: up to 3 retries on failure, with failure analysis between attempts.

**Tech Stack:** TypeScript, Bun workspaces, Playwright (browser driver), Ajv JSON Schema, existing Artifact Repository / Workflow Engine / Plugin Runtime contracts, YAML manifests.

---

## File Structure

- `packages/workflow-engine/src/automation-policy.ts` — extend with real-browser assertion policy (screenshot-on-fail, console-log-collection)
- `packages/domain/src/bug-report.ts` — TypeScript domain types for `BugReport`, `BugReportInput`
- `schemas/bug-report.schema.json` — BugReport schema
- `schemas/bug-report-input.schema.json` — BugReportInput schema (ingested evidence)
- `plugins/playwright/src/real.ts` — Real Playwright driver: browser launch, spec execution, screenshot capture, RunRecord + EvidencePack production
- `plugins/playwright/src/self-heal.ts` — Self-healing: analyze failure output, retry up to 3 attempts with modified strategy
- `plugins/playwright/src/session.ts` — Browser session management: login cookies, storage state persistence
- `plugins/playwright/package.json` — add `playwright` dependency
- `plugins/report/package.json` — new report plugin
- `plugins/report/plugin.yaml` — report plugin manifest
- `plugins/report/src/allure.ts` — Allure HTML report generator
- `plugins/report/src/html-renderer.ts` — standalone HTML bug report renderer
- `plugins/notify/src/dingtalk.ts` — DingTalk notification action (v0.3 includes contract + mock; real DingTalk in later phase)
- `skills/ui-script-gen/skill.yaml` — update to reference real driver
- `workflows/ui-script-gen.yaml` — add bug-report, notify nodes
- `apps/cli/src/index.ts` — add `--browser` flag to toggle real vs mock, `--report` flag for report-only mode
- `tests/playwright-real-driver.test.ts` — real Playwright driver tests with mocked `fetch` for browser checks
- `tests/self-heal.test.ts` — self-healing retry logic tests
- `tests/bug-report.test.ts` — bug report schema + builder tests
- `tests/report-plugin.test.ts` — report plugin smoke tests
- `tests/ui-script-gen.real.test.ts` — end-to-end real-demo contract test
- `tests/automation-foundation-smoke.test.ts` — extend to verify real-mode artifacts

---

## Task 0: Real Playwright Driver Foundation

**Objective:** Replace the mock `playwright.runPlan` action with a real Playwright driver that can install browsers, execute a single `.spec.ts` script in headless mode, and capture screenshots + console logs.

**Files:**
- Create: `plugins/playwright/src/real.ts`
- Create: `plugins/playwright/src/session.ts`
- Modify: `plugins/playwright/src/mock.ts` — keep mock as fallback
- Modify: `plugins/playwright/plugin.yaml` — register real action
- Modify: `packages/domain/src/automation.ts` — add real-mode types including `stepResults` to `RunRecord.caseResults`
- Create: `tests/playwright-real-driver.test.ts`

### Step 1: Add real-mode types

Add to `packages/domain/src/automation.ts`:

```ts
export interface PlaywrightRealOptions {
  browserType: "chromium" | "firefox" | "webkit";
  headless: boolean;
  screenshotOnFailure: boolean;
  screenshotOnPass: boolean;
  collectConsoleLogs: boolean;
  timeout: number; // ms per step
  retryCount: number;
}

export type RealRunStatus = "passed" | "failed" | "error" | "skipped";

export interface RealStepResult {
  stepId: string;
  status: RealRunStatus;
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  consoleLogs?: string[];
}
```

**Step 2: Write failing test**

Create `tests/playwright-real-driver.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { executeRunPlan } from "../plugins/playwright/src/real";

describe("real playwright driver", () => {
  test("throws when no browser is installed", async () => {
    await expect(
      executeRunPlan({
        project: "demo",
        feature: "rule-config",
        runner: "playwright",
        mode: "real",
        sourceFlowSpecRef: "FlowSpec:test",
        scriptPath: "nonexistent.spec.ts",
        flows: [],
      }, { browserType: "chromium", headless: true, screenshotOnFailure: true, screenshotOnPass: false, collectConsoleLogs: true, timeout: 30000, retryCount: 0 })
    ).rejects.toThrow(/browser|executable|not found/i);
  });
});
```

### Step 3: Implement real Playwright driver

Create `plugins/playwright/src/real.ts`:

```ts
import { createHash } from "crypto";
import type { RunPlan, RunRecord, EvidencePack, PlaywrightRealOptions, RealStepResult } from "@kata-agent/domain";
import { assertValidSchema } from "@kata-agent/domain";
import { chromium, type Browser, type Page } from "playwright";

function computeHash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

import * as fs from "fs";
import * as path from "path";

export interface RealDriverResult {
  record: RunRecord;
  evidence: EvidencePack;
}

export async function executeRunPlan(
  plan: RunPlan,
  options: PlaywrightRealOptions,
  featureDir: string,
): Promise<RealDriverResult> {
  const evidenceDir = path.join(featureDir, "automation", "evidence");
  const screenshotDir = path.join(evidenceDir, "screenshots");
  const logDir = path.join(evidenceDir, "logs");
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const browser: Browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAt = new Date();

  const caseResults: RunRecord["caseResults"] = [];
  const evidence: EvidencePack["evidence"] = [];
  const allConsoleLogs: string[] = [];

  page.on("console", (msg) => {
    allConsoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  try {
    for (const flow of plan.flows) {
      const flowStart = Date.now();
      const stepResults: RealStepResult[] = [];
      let flowStatus: RealRunStatus = "passed";

      try {
        if (flow.entryUrl) {
          await page.goto(flow.entryUrl, { waitUntil: "networkidle" });
        }

        for (const step of flow.steps) {
          const stepStart = Date.now();
          try {
            switch (step.action) {
              case "click":
                await page.click(step.selector, { timeout: options.timeout });
                break;
              case "fill":
                await page.fill(step.selector, step.expected);
                break;
              case "wait":
                await page.waitForSelector(step.selector, { timeout: options.timeout });
                break;
              case "navigate":
                await page.goto(step.expected, { waitUntil: "networkidle" });
                break;
              default:
                throw new Error(`Unknown action: ${step.action}`);
            }
            stepResults.push({
              stepId: step.id,
              status: "passed",
              durationMs: Date.now() - stepStart,
              consoleLogs: [...allConsoleLogs],
            });
          } catch (err) {
                const screenshotPath = options.screenshotOnFailure
                  ? path.join(screenshotDir, `${flow.flowId}-${step.id}-fail.png`)
                  : undefined;
                if (screenshotPath) {
                  await page.screenshot({ path: screenshotPath, fullPage: true });
                  const screenshotBuffer = fs.readFileSync(screenshotPath);
                  evidence.push({
                    id: `EVID-SS-${flow.flowId}-${step.id}`,
                    kind: "screenshot",
                    path: path.relative(featureDir, screenshotPath),
                    hash: `sha256:${createHash("sha256").update(screenshotBuffer).digest("hex")}`,
                  });
                }
            stepResults.push({
              stepId: step.id,
              status: "failed",
              durationMs: Date.now() - stepStart,
              error: err instanceof Error ? err.message : String(err),
              screenshotPath: screenshotPath ? path.relative(featureDir, screenshotPath) : undefined,
              consoleLogs: [...allConsoleLogs],
            });
            flowStatus = "failed";
          }
        }
      } catch (err) {
        flowStatus = "error";
      }

      caseResults.push({
        testCaseId: flow.testCaseId,
        status: flowStatus,
        assertionResults: flow.assertions.map((a) => ({
          assertionId: a.id,
          status: flowStatus,
          expected: a.expected,
        })),
        stepResults,
      });
    }
  } finally {
    await browser.close();
  }

  const finishedAt = new Date();
  const runId = crypto.randomUUID();
  const overallStatus = caseResults.every((r) => r.status === "passed") ? "passed" : "failed";

  // Write console logs
  const logPath = path.join(logDir, "console.log");
  const consoleContent = allConsoleLogs.join("\n");
  fs.writeFileSync(logPath, consoleContent, "utf8");
  evidence.push({
    id: "EVID-CONSOLE",
    kind: "console-log",
    path: path.relative(featureDir, logPath),
    hash: computeHash(consoleContent),
  });

  // Write run log
  const runLogPath = path.join(logDir, "run-log.txt");
  const runLogContent = JSON.stringify({ caseResults, stepResults: caseResults.flatMap((r) => r.stepResults ?? []) }, null, 2);
  fs.writeFileSync(runLogPath, runLogContent, "utf8");
  evidence.push({
    id: "EVID-RUN-LOG",
    kind: "run-log",
    path: path.relative(featureDir, runLogPath),
    hash: computeHash(runLogContent),
  });

  const record: RunRecord = {
    schemaVersion: "0.1",
    project: plan.project,
    feature: plan.feature,
    runId,
    runner: "playwright",
    status: overallStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    caseResults,
    evidenceFiles: evidence.map((e) => e.path),
  };

  const evidencePack: EvidencePack = {
    schemaVersion: "0.1",
    project: plan.project,
    feature: plan.feature,
    runRecordRef: `RunRecord:${runId}`,
    evidence,
  };

  assertValidSchema("RunRecord", record);
  assertValidSchema("EvidencePack", evidencePack);

  return { record, evidence };
}
```

### Step 4: Run test to verify failure

Run: `bun test tests/playwright-real-driver.test.ts`
Expected: FAIL — "browser" / "not found" (Playwright not installed)

### Step 5: Add Playwright dependency and install browsers

Add `"playwright"` to `plugins/playwright/package.json` dependencies:

```json
{
  "name": "@kata-agent/plugin-playwright",
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "^1.52.0"
  }
}
```

Run: `bun install` (from repo root)
Run: `bunx playwright install chromium`
Expected: Chromium browser installed.

### Step 6: Run test again (GREEN)

Run: `bun test tests/playwright-real-driver.test.ts`
Expected: PASS.

### Step 7: Register real action via runtime-factory

Keep the existing flat array format in `plugins/playwright/plugin.yaml`. Do NOT change the manifest structure. Instead, add a second action entry `playwright.runPlan.real`:

```yaml
  - id: playwright.runPlan.real
    title: Run automated plan (real browser)
    inputSchema: RunPlan
    outputSchema: RunRecord
    sideEffects:
      - network
      - artifact-write
```

Modify `packages/workflow-engine/src/runtime-factory.ts` to select the mock or real action based on `--mode` flag at runtime, not via manifest structure changes.

### Step 8: Run full test suite

Run: `bun test`
Expected: all tests pass.

### Step 9: Commit

```bash
git add plugins/playwright/src/ packages/domain/src/automation.ts tests/playwright-real-driver.test.ts
git commit -m "feat: add real Playwright browser driver"
```

---

## Task 1: Browser Session Management

**Objective:** Add login session persistence (cookies, localStorage, storageState) so automated tests can run against authenticated environments.

**Files:**
- Create: `plugins/playwright/src/session.ts`
- Create: `tests/playwright-session.test.ts`

### Step 1: Write failing session test

Create `tests/playwright-session.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { saveStorageState, loadStorageState } from "../plugins/playwright/src/session";

describe("browser session management", () => {
  test("save and load storage state round-trips cookie data", () => {
    const testDir = mkdtempSync(join(tmpdir(), "kata-session-"));
    const state = { cookies: [{ name: "test", value: "val", domain: ".example.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] };
    const statePath = join(testDir, "state.json");
    saveStorageState(state, statePath);
    const loaded = loadStorageState(statePath);
    expect(loaded.cookies).toEqual(state.cookies);
    rmSync(testDir, { recursive: true });
  });
});
```

### Step 2: Run test to verify (RED)

Run: `bun test tests/playwright-session.test.ts`
Expected: FAIL — `saveStorageState` / `loadStorageState` not exported from session module.

### Step 3: Implement session management (sync, not async — fs.*Sync calls don't need async)

```ts
// plugins/playwright/src/session.ts
import type { BrowserContext } from "playwright";
import * as fs from "fs";

export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

export function saveStorageState(state: StorageState, statePath: string): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function loadStorageState(statePath: string): StorageState {
  const raw = fs.readFileSync(statePath, "utf8");
  return JSON.parse(raw) as StorageState;
}

export function applyStorageState(context: BrowserContext, statePath: string): Promise<void> {
  const state = loadStorageState(statePath);
  return context.addCookies(state.cookies);
}

### Step 4: Run tests

Run: `bun test tests/playwright-session.test.ts`
Expected: PASS.

### Step 4: Commit

```bash
git add plugins/playwright/src/session.ts tests/playwright-session.test.ts
git commit -m "feat: add browser session management"
```

---

## Task 2: Self-Healing Retry Logic

**Objective:** When a flow fails, analyze the failure output, retry up to 3 attempts with progressive backoff and modified strategy (e.g., different selectors).

**Files:**
- Create: `plugins/playwright/src/self-heal.ts`
- Create: `tests/self-heal.test.ts`

### Step 1: Write failing test

```ts
// tests/self-heal.test.ts
import { describe, expect, test } from "bun:test";
import { selfHealingRun } from "../plugins/playwright/src/self-heal";
import type { RunPlan } from "@kata-agent/domain";

describe("self-healing retry", () => {
  test("retries up to maxAttempts on transient failure", async () => {
    let attempts = 0;
    const result = await selfHealingRun(
      { flows: [{ flowId: "FLOW-001", testCaseId: "TC-001", title: "test", entryUrl: "/", steps: [], assertions: [] }] } as RunPlan,
      { browserType: "chromium", headless: true, screenshotOnFailure: true, screenshotOnPass: false, collectConsoleLogs: true, timeout: 1000, retryCount: 3 },
      "/tmp",
      async () => { attempts++; throw new Error("transient"); }
    );
    expect(attempts).toBe(3);
    expect(result.record.status).toBe("failed");
  });
});
```

### Step 2: Implement self-healing wrapper

```ts
// plugins/playwright/src/self-heal.ts
import type { RunPlan, PlaywrightRealOptions } from "@kata-agent/domain";
import type { RealDriverResult } from "./real";

export interface SelfHealConfig {
  maxAttempts: number;
  backoffMs: number;
}

export async function selfHealingRun(
  plan: RunPlan,
  options: PlaywrightRealOptions,
  featureDir: string,
  executeFn: (plan: RunPlan, options: PlaywrightRealOptions, featureDir: string) => Promise<RealDriverResult>,
  config: SelfHealConfig = { maxAttempts: 3, backoffMs: 2000 },
): Promise<RealDriverResult> {
  let lastResult: RealDriverResult | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      lastResult = await executeFn(plan, options, featureDir);
      if (lastResult.record.status === "passed") return lastResult;
    } catch (err) {
      // transient — continue
    }
    if (attempt < config.maxAttempts) {
      await new Promise((r) => setTimeout(r, config.backoffMs * attempt));
    }
  }
  return lastResult!;
}
```

### Step 3: Run tests

Run: `bun test tests/self-heal.test.ts`
Expected: PASS.

### Step 4: Commit

```bash
git add plugins/playwright/src/self-heal.ts tests/self-heal.test.ts
git commit -m "feat: add self-healing retry logic"
```

---

## Task 3: Bug Report Domain Contracts

**Objective:** Add schema-backed `BugReport` and `BugReportInput` contracts for structured bug reporting.

**Files:**
- Create: `packages/domain/src/bug-report.ts`
- Create: `schemas/bug-report.schema.json`
- Create: `schemas/bug-report-input.schema.json`
- Modify: `packages/domain/src/schemas.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `tests/bug-report.test.ts`

### Step 1: Add failing test

```ts
// tests/bug-report.test.ts
import { describe, expect, test } from "bun:test";
import { SCHEMA_REGISTRY, validateSchema } from "../packages/domain/src/index";

describe("bug report contracts", () => {
  test("schemas are registered", () => {
    expect(SCHEMA_REGISTRY.BugReport).toBe("schemas/bug-report.schema.json");
    expect(SCHEMA_REGISTRY.BugReportInput).toBe("schemas/bug-report-input.schema.json");
  });

  test("accepts valid bug report", () => {
    const report = {
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
          expected: "toast text is 保存成功",
          actual: "button click produced no visible response",
          screenshotRef: "EVID-SS-FLOW-001-STEP-001",
          consoleLogRef: "EVID-CONSOLE",
          recommendation: "检查按钮是否被遮罩层覆盖",
        },
      ],
    };
    expect(validateSchema("BugReport", report).valid).toBe(true);
  });
});
```

### Step 2: Add schemas and types

Create `packages/domain/src/bug-report.ts`:

```ts
export interface BugReportInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  caseResults: Array<{
    testCaseId: string;
    status: string;
    flowTitle: string;
    failedSteps: Array<{
      stepId: string;
      action: string;
      selector: string;
      expected: string;
      error: string;
      screenshotPath?: string;
      consoleLogs?: string[];
    }>;
  }>;
}

export interface BugReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  bugs: Array<{
    id: string;
    title: string;
    severity: "P0" | "P1" | "P2";
    testCaseId: string;
    flowId: string;
    stepId: string;
    expected: string;
    actual: string;
    screenshotRef?: string;
    consoleLogRef?: string;
    recommendation?: string;
  }>;
}
```

Create `schemas/bug-report.schema.json` and `schemas/bug-report-input.schema.json` following the TypeScript type shape.

Modify `packages/domain/src/schemas.ts` — add `BugReport` and `BugReportInput` to `SCHEMA_REGISTRY`.

### Step 3: Run tests

Run: `bun test tests/bug-report.test.ts`
Expected: PASS.

### Step 4: Commit

```bash
git add packages/domain/src/bug-report.ts schemas/bug-report*.json tests/bug-report.test.ts
git commit -m "feat: add BugReport and BugReportInput domain contracts"
```

---

## Task 4: Bug Report Builder (Artifact Builder)

**Objective:** Build a `BugReport` artifact from a failed `RunRecord` + `EvidencePack`.

**Files:**
- Create: `packages/workflow-engine/src/bug-report-builder.ts`
- Create: `tests/bug-report-builder.test.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Modify: `packages/workflow-engine/src/artifact-builders.ts`

### Step 1: Write failing test

```ts
// tests/bug-report-builder.test.ts
import { describe, expect, test } from "bun:test";
import { buildBugReport } from "../packages/workflow-engine/src/bug-report-builder";
import type { RunRecord, EvidencePack } from "@kata-agent/domain";

describe("bug report builder", () => {
  test("builds BugReport from failed RunRecord", () => {
    const record: RunRecord = {
      schemaVersion: "0.1", project: "demo", feature: "rule-config", runId: "run-1",
      runner: "playwright", status: "failed", startedAt: "", finishedAt: "",
      caseResults: [{ testCaseId: "TC-001", status: "failed", assertionResults: [] }],
      evidenceFiles: ["screenshots/ss.png"],
    };
    const evidence: EvidencePack = {
      schemaVersion: "0.1", project: "demo", feature: "rule-config",
      runRecordRef: "RunRecord:run-1",
      evidence: [{ id: "EVID-SS-1", kind: "screenshot", path: "screenshots/ss.png", hash: "sha256:abc" }],
    };
    const report = buildBugReport(record, evidence);
    expect(report.bugs.length).toBeGreaterThan(0);
    expect(report.bugs[0].severity).toBe("P0");
  });

  test("returns empty bugs array for passed run", () => {
    const record: RunRecord = {
      schemaVersion: "0.1", project: "demo", feature: "rule-config", runId: "run-2",
      runner: "playwright", status: "passed", startedAt: "", finishedAt: "",
      caseResults: [{ testCaseId: "TC-002", status: "passed", assertionResults: [] }],
      evidenceFiles: [],
    };
    const report = buildBugReport(record, { schemaVersion: "0.1", project: "demo", feature: "rule-config", runRecordRef: "RunRecord:run-2", evidence: [] });
    expect(report.bugs).toHaveLength(0);
  });
});
```

### Step 2: Implement builder

```ts
// packages/workflow-engine/src/bug-report-builder.ts
import type { RunRecord, EvidencePack, BugReport } from "@kata-agent/domain";

export function buildBugReport(record: RunRecord, evidence: EvidencePack): BugReport {
  const bugs: BugReport["bugs"] = [];
  const screenshotMap = new Map(
    evidence.evidence.filter((e) => e.kind === "screenshot").map((e) => [e.id, e])
  );

  let index = 0;
  for (const cr of record.caseResults) {
    if (cr.status === "passed") continue;
    bugs.push({
      id: `BUG-${record.runId}-${index}`,
      title: `用例 ${cr.testCaseId} 执行失败`,
      severity: "P0",
      testCaseId: cr.testCaseId,
      flowId: "",
      stepId: "",
      expected: "",
      actual: cr.status,
      screenshotRef: screenshotMap.size > 0 ? [...screenshotMap.keys()][0] : undefined,
    });
    index++;
  }

  return {
    schemaVersion: "0.1",
    project: record.project,
    feature: record.feature,
    runId: record.runId,
    bugs,
  };
}
```

### Step 3: Run tests

Run: `bun test tests/bug-report-builder.test.ts`
Expected: PASS.

### Step 4: Commit

```bash
git add packages/workflow-engine/src/bug-report-builder.ts tests/bug-report-builder.test.ts
git commit -m "feat: add BugReport artifact builder"
```

---

## Task 5: Allure HTML Report Plugin

**Objective:** Generate an Allure-compatible HTML report from a successful `RunRecord`.

**Files:**
- Create: `plugins/report/package.json`
- Create: `plugins/report/plugin.yaml`
- Create: `plugins/report/src/allure.ts`
- Create: `plugins/report/src/html-renderer.ts`
- Create: `tests/report-plugin.test.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`

### Step 1: Create plugin skeleton

```bash
mkdir -p plugins/report/src
```

Create `plugins/report/package.json`:

```json
{
  "name": "@kata-agent/plugin-report",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Create `plugins/report/plugin.yaml`:

```yaml
name: report
description: "HTML and Allure report generation"
version: "0.1.0"
type: artifact-export
actions:
  generateAllureReport:
    handler: plugins/report/src/allure.ts
    sideEffects:
      - artifact-write
  generateHtmlReport:
    handler: plugins/report/src/html-renderer.ts
    sideEffects:
      - artifact-write
```

### Step 2: Write failing test

```ts
// tests/report-plugin.test.ts
import { describe, expect, test } from "bun:test";
import { generateHtmlReport } from "../plugins/report/src/html-renderer";
import type { RunRecord } from "@kata-agent/domain";

describe("report plugin", () => {
  test("generates HTML content for a passed run", () => {
    const record: RunRecord = {
      schemaVersion: "0.1", project: "demo", feature: "rule-config", runId: "run-1",
      runner: "playwright", status: "passed", startedAt: "2026-05-01T00:00:00Z", finishedAt: "2026-05-01T00:00:10Z",
      caseResults: [{ testCaseId: "TC-001", status: "passed", assertionResults: [] }],
      evidenceFiles: [],
    };
    const html = generateHtmlReport(record);
    expect(html).toContain("<html>");
    expect(html).toContain("PASSED");
  });
});
```

### Step 3: Implement HTML report renderer

```ts
// plugins/report/src/html-renderer.ts
import type { RunRecord } from "@kata-agent/domain";

export function generateHtmlReport(record: RunRecord): string {
  const passCount = record.caseResults.filter((r) => r.status === "passed").length;
  const failCount = record.caseResults.filter((r) => r.status === "failed").length;
  const totalCount = record.caseResults.length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${record.project} - Automation Report</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; }
h1 { color: #333; }
.summary { display: flex; gap: 1rem; margin: 1rem 0; }
.pass { color: #22c55e; font-weight: bold; }
.fail { color: #ef4444; font-weight: bold; }
.total { color: #666; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eee; }
</style></head>
<body>
  <h1>${record.project} / ${record.feature}</h1>
  <p>Run: ${record.runId} | ${record.runner} | ${record.startedAt}</p>
  <div class="summary">
    <span class="total">Total: ${totalCount}</span>
    <span class="pass">Passed: ${passCount}</span>
    <span class="fail">Failed: ${failCount}</span>
  </div>
  <table>
    <tr><th>Case</th><th>Status</th></tr>
    ${record.caseResults.map((r) =>
      `<tr><td>${r.testCaseId}</td><td class="${r.status === "passed" ? "pass" : "fail"}">${r.status.toUpperCase()}</td></tr>`
    ).join("")}
  </table>
  ${record.evidenceFiles.length > 0 ? `<h2>Evidence</h2><ul>${record.evidenceFiles.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
</body></html>`;
}
```

### Step 4: Run tests

Run: `bun test tests/report-plugin.test.ts`
Expected: PASS.

### Step 5: Commit

```bash
git add plugins/report/ tests/report-plugin.test.ts
git commit -m "feat: add HTML report generation plugin"
```

---

## Task 6: Real-Mode Runtime Factory + CLI Integration

**Objective:** Wire the real Playwright driver into the runtime factory and CLI, so `--mode real` selects real execution and `--browser chromium` drives Playwright.

**Files:**
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `tests/ui-script-gen.real.test.ts`

### Step 1: Extend runtime factory

In `runtime-factory.ts`, when mode is `"real"` and runner is `"playwright"`, register the real driver and self-healing wrapper.

### Step 2: Add CLI `--browser` flag

Add `--browser` and `--mode` flags to the `ui-script-gen` command.

### Step 3: Write real-demo contract test

```ts
// tests/ui-script-gen.real.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { repoRoot } from "../packages/workflow-engine/src/paths";

describe("ui-script-gen real demo", () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots) try { rmSync(r, { recursive: true }); } catch {} });

  test("mock mode produces RunRecord without browser", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const proc = Bun.spawn([
      "bun", "apps/cli/src/index.ts", "ui-script-gen",
      "--project", "demo", "--feature", "rule-config",
      "--test-spec", "test-spec/test-spec.json", "--root", rootDir,
    ], { cwd: repoRoot(), stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output).status).toBe("succeeded");
  });

  test("real mode without browser errors gracefully", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const proc = Bun.spawn([
      "bun", "apps/cli/src/index.ts", "ui-script-gen",
      "--project", "demo", "--feature", "rule-config",
      "--test-spec", "test-spec/test-spec.json", "--root", rootDir,
      "--mode", "real", "--browser", "chromium",
    ], { cwd: repoRoot(), stderr: "pipe" });
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(error).toContain("PLAYWRIGHT_REAL_RUNTIME_NOT_IMPLEMENTED");
  });
});
```

### Step 4: Run tests

Run: `bun test tests/ui-script-gen.real.test.ts`
Expected: PASS (mock mode succeeds, real mode without browser errors gracefully).

### Step 5: Commit

```bash
git add packages/workflow-engine/src/runtime-factory.ts apps/cli/src/index.ts tests/ui-script-gen.real.test.ts
git commit -m "feat: wire real-mode Playwright driver into CLI and runtime factory"
```

---

## Task 7: Notify Plugin (Contract + Mock)

**Objective:** Add a `notify` plugin with DingTalk contract and mock action for post-run notifications.

**Files:**
- Create: `plugins/notify/package.json`
- Create: `plugins/notify/plugin.yaml`
- Create: `plugins/notify/src/mock.ts`
- Create: `tests/notify-plugin.test.ts`

### Step 1: Create plugin skeleton

```bash
mkdir -p plugins/notify/src
```

### Step 2: Write mock notify action

```ts
// plugins/notify/src/mock.ts
export async function sendNotification(params: { channel: string; title: string; body: string }): Promise<{ sent: boolean }> {
  return { sent: true };
}
```

### Step 3: Add test

```ts
import { describe, expect, test } from "bun:test";
import { sendNotification } from "../plugins/notify/src/mock";

test("mock notify sends without error", async () => {
  const result = await sendNotification({ channel: "dingtalk", title: "Test Run", body: "All passed" });
  expect(result.sent).toBe(true);
});
```

### Step 4: Commit

```bash
git add plugins/notify/ tests/notify-plugin.test.ts
git commit -m "feat: add notify plugin with mock DingTalk action"
```

---

## Task 8: Update Workflow Manifests

**Objective:** Update `ui-script-gen` workflow YAML to include bug report and notification nodes.

**Files:**
- Modify: `workflows/ui-script-gen.yaml`
- Modify: `skills/ui-script-gen/skill.yaml`
- Modify: `tests/manifest-references.test.ts`

### Steps:

1. Add `bug-report` node after `run-automation` (type: `tool`, action: `report.generateHtmlReport`)
2. Add `notify-run-complete` node (type: `tool`, action: `notify.sendNotification`, dependsOn: `bug-report`)
3. Update skill manifest output artifacts to include `BugReport` and HTML report
4. Update `tests/manifest-references.test.ts` — the hardcoded `expect(workflow.nodes).toEqual([...])` assertion must be updated to include the new `bug-report` and `notify-run-complete` nodes
5. Verify manifest reference tests still pass

### Commit

```bash
git add workflows/ui-script-gen.yaml skills/ui-script-gen/skill.yaml
git commit -m "feat: add bug-report and notify nodes to ui-script-gen workflow"
```

---

## Task 9: Full Verification

**Files:**
- No production files.

### Step 1: Run all tests

Run: `bun test`
Expected: all tests pass.

### Step 2: Run TypeScript check

Run: `bun run typecheck`
Expected: no TypeScript errors.

### Step 3: Run source scan

Run:
```bash
rg -n "PLAYWRIGHT_REAL_RUNTIME_NOT_IMPLEMENTED|mock_only|Capability|MindMapExport|Archive" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```
Expected: `PLAYWRIGHT_REAL_RUNTIME_NOT_IMPLEMENTED` no longer appears (replaced by real driver).

### Step 4: Run secret/path scan

Run:
```bash
rg -n "LANHU_COOKIE=|Bearer [A-Za-z0-9]|https://[^ ]*internal|/Users/|/private/" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```
Expected: no hardcoded secrets, internal URLs, or local absolute paths.

### Step 5: Check workspace packages

Run:
```bash
find apps packages plugins -mindepth 2 -maxdepth 2 -name package.json -print | sort
```
Expected includes:
```
apps/cli/package.json
packages/agent-runner/package.json
packages/artifact-repo/package.json
...
plugins/notify/package.json   ← new
plugins/playwright/package.json
plugins/report/package.json   ← new
...
```

### Step 6: Verify README

Ensure `README.md` documents the new `--mode` and `--browser` flags.

### Step 7: Commit

```bash
git add README.md apps packages plugins schemas tests docs/superpowers/plans/2026-05-01-kata-agent-v0.3-real-automation.md
git commit -m "docs: finalize v0.3 real automation verification"
```

---

## Hard Constraints

- Use Bun workspaces. All new plugin packages need `package.json`.
- Keep `SCHEMA_REGISTRY` as schema source of truth.
- Keep workflow node types exactly: `tool`, `agent`, `gate`, `human`, `artifact`.
- Use Skill, not Capability.
- Use plugins, not integrations.
- Do not hardcode absolute paths.
- Do not hardcode credentials, cookies, tokens, or internal URLs.
- File tests must use temp dirs and clean them up.
- Do not weaken assertions to make automation pass.
- `WorkflowExecutor` remains the only flow controller.
- Real Playwright browser is only required for Task 0 Step 5; all other steps pass with mock/mocked fetch.
- `{project}` in paths is always the project name, never a filesystem path segment.
