import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  assertValidSchema,
  type EvidencePack,
  type PlaywrightRealOptions,
  type RealRunStatus,
  type RealStepResult,
  type RunPlan,
  type RunRecord,
} from "@kata-agent/domain";

export interface RealDriverResult {
  record: RunRecord;
  evidence: EvidencePack;
}

function computeHash(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function artifactPath(featureDir: string, filePath: string): string {
  return path.relative(featureDir, filePath).split(path.sep).join("/");
}

function evidenceEntryId(prefix: string, flowId: string, stepId: string): string {
  return `${prefix}-${flowId}-${stepId}`;
}

function assertionStatus(status: RealRunStatus): "passed" | "failed" {
  return status === "passed" ? "passed" : "failed";
}

export async function executeRunPlan(
  plan: RunPlan,
  options: PlaywrightRealOptions,
  featureDir = process.cwd(),
): Promise<RealDriverResult> {
  if (plan.runner !== "playwright") {
    throw new Error("INVALID_INPUT runner must be playwright");
  }
  if (plan.mode !== "real") {
    throw new Error("INVALID_INPUT executeRunPlan only accepts real mode");
  }

  const evidenceDir = path.join(featureDir, "automation", "evidence");
  const screenshotDir = path.join(evidenceDir, "screenshots");
  const logDir = path.join(evidenceDir, "logs");
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright browser executable not found: ${message}`);
  }

  const launcher = playwright[options.browserType];
  const browser = await launcher.launch({ headless: options.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAt = new Date();
  const caseResults: RunRecord["caseResults"] = [];
  const evidence: EvidencePack["evidence"] = [];
  const allConsoleLogs: string[] = [];
  const scriptPath = path.isAbsolute(plan.scriptPath)
    ? plan.scriptPath
    : path.join(featureDir, plan.scriptPath);

  if (options.collectConsoleLogs) {
    page.on("console", (message) => {
      allConsoleLogs.push(`[${message.type()}] ${message.text()}`);
    });
  }

  try {
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Playwright spec not found: ${plan.scriptPath}`);
    }

    for (const flow of plan.flows) {
      const stepResults: RealStepResult[] = [];
      let flowStatus: RealRunStatus = "passed";

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
              await page.fill(step.selector, step.expected, {
                timeout: options.timeout,
              });
              break;
            case "wait":
              await page.waitForSelector(step.selector, {
                timeout: options.timeout,
              });
              break;
            case "navigate":
              await page.goto(step.expected, { waitUntil: "networkidle" });
              break;
            default:
              throw new Error(`Unknown action: ${step.action}`);
          }

          const screenshotPath = options.screenshotOnPass
            ? path.join(screenshotDir, `${flow.flowId}-${step.id}-pass.png`)
            : undefined;
          if (screenshotPath) {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            evidence.push({
              id: evidenceEntryId("EVID-SS", flow.flowId, step.id),
              kind: "screenshot",
              path: artifactPath(featureDir, screenshotPath),
              hash: computeHash(fs.readFileSync(screenshotPath)),
            });
          }

          stepResults.push({
            stepId: step.id,
            status: "passed",
            durationMs: Date.now() - stepStart,
            screenshotPath: screenshotPath
              ? artifactPath(featureDir, screenshotPath)
              : undefined,
            consoleLogs: options.collectConsoleLogs
              ? [...allConsoleLogs]
              : undefined,
          });
        } catch (error) {
          flowStatus = "failed";
          const screenshotPath = options.screenshotOnFailure
            ? path.join(screenshotDir, `${flow.flowId}-${step.id}-fail.png`)
            : undefined;
          if (screenshotPath) {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            evidence.push({
              id: evidenceEntryId("EVID-SS", flow.flowId, step.id),
              kind: "screenshot",
              path: artifactPath(featureDir, screenshotPath),
              hash: computeHash(fs.readFileSync(screenshotPath)),
            });
          }

          stepResults.push({
            stepId: step.id,
            status: "failed",
            durationMs: Date.now() - stepStart,
            screenshotPath: screenshotPath
              ? artifactPath(featureDir, screenshotPath)
              : undefined,
            error: error instanceof Error ? error.message : String(error),
            consoleLogs: options.collectConsoleLogs
              ? [...allConsoleLogs]
              : undefined,
          });
        }
      }

      caseResults.push({
        testCaseId: flow.testCaseId,
        status: flowStatus,
        assertionResults: flow.assertions.map((assertion) => ({
          assertionId: assertion.id,
          status: assertionStatus(flowStatus),
          expected: assertion.expected,
        })),
        stepResults,
      });
    }
  } catch (error) {
    if (caseResults.length === 0 && plan.flows.length > 0) {
      const flow = plan.flows[0]!;
      caseResults.push({
        testCaseId: flow.testCaseId,
        status: "error",
        assertionResults: flow.assertions.map((assertion) => ({
          assertionId: assertion.id,
          status: "failed",
          expected: assertion.expected,
          message: error instanceof Error ? error.message : String(error),
        })),
        stepResults: [],
      });
    }
    throw error;
  } finally {
    await browser.close();
  }

  const finishedAt = new Date();
  const runId = randomUUID();
  const overallStatus = caseResults.every((result) => result.status === "passed")
    ? "passed"
    : "failed";

  const consoleLogPath = path.join(logDir, "console.log");
  const consoleContent = allConsoleLogs.join("\n");
  fs.writeFileSync(consoleLogPath, consoleContent, "utf8");
  evidence.push({
    id: "EVID-CONSOLE",
    kind: "console",
    path: artifactPath(featureDir, consoleLogPath),
    hash: computeHash(consoleContent),
  });

  const runLogPath = path.join(logDir, "run-log.txt");
  const runLogContent = JSON.stringify(
    {
      caseResults,
      stepResults: caseResults.flatMap((result) => result.stepResults ?? []),
    },
    null,
    2,
  );
  fs.writeFileSync(runLogPath, runLogContent, "utf8");
  evidence.push({
    id: "EVID-RUN-LOG",
    kind: "run-log",
    path: artifactPath(featureDir, runLogPath),
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
    evidenceFiles: evidence.map((item) => item.path),
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

  return { record, evidence: evidencePack };
}
