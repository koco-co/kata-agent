import { randomUUID } from "node:crypto";
import type {
  PlaywrightRealOptions,
  RealStepResult,
  RunPlan,
  RunRecord,
} from "@kata-agent/domain";
import type { RealDriverResult } from "./real";

export interface SelfHealConfig {
  maxAttempts: number;
  backoffMs: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureOutput(result: RealDriverResult): string {
  return result.record.caseResults
    .flatMap((caseResult) => [
      ...caseResult.assertionResults.map((assertion) => assertion.message ?? ""),
      ...(caseResult.stepResults ?? []).map((step) => step.error ?? ""),
    ])
    .filter(Boolean)
    .join("\n");
}

function planWithFallbackSelector(plan: RunPlan, output: string): RunPlan {
  let changed = false;
  const flows = plan.flows.map((flow) => {
    let flowChanged = false;
    const steps = flow.steps.map((step) => {
      if (!step.expected || !output.includes(step.selector)) {
        return step;
      }

      const fallbackSelector = `text=${step.expected}`;
      if (step.selector === fallbackSelector) {
        return step;
      }

      changed = true;
      flowChanged = true;
      return {
        ...step,
        selector: fallbackSelector,
      };
    });

    return flowChanged ? { ...flow, steps } : flow;
  });

  return changed ? { ...plan, flows } : plan;
}

function failedResultFromError(
  plan: RunPlan,
  error: unknown,
  startedAt: Date,
): RealDriverResult {
  const runId = randomUUID();
  const message = errorMessage(error);
  const project = plan.project ?? "unknown";
  const feature = plan.feature ?? "unknown";
  const fallbackStep: RealStepResult = {
    stepId: "self-heal",
    status: "error",
    durationMs: 0,
    error: message,
  };

  const record: RunRecord = {
    schemaVersion: "0.1",
    project,
    feature,
    runId,
    runner: "playwright",
    status: "failed",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    caseResults: plan.flows.map((flow) => ({
      testCaseId: flow.testCaseId,
      status: "error",
      assertionResults: flow.assertions.map((assertion) => ({
        assertionId: assertion.id,
        status: "failed",
        expected: assertion.expected,
        message,
      })),
      stepResults:
        flow.steps.length > 0
          ? flow.steps.map((step) => ({
              stepId: step.id,
              status: "error",
              durationMs: 0,
              error: message,
            }))
          : [fallbackStep],
    })),
    evidenceFiles: [],
  };

  return {
    record,
    evidence: {
      schemaVersion: "0.1",
      project,
      feature,
      runRecordRef: `RunRecord:${runId}`,
      evidence: [],
    },
  };
}

export async function selfHealingRun(
  plan: RunPlan,
  options: PlaywrightRealOptions,
  featureDir: string,
  executeFn: (
    plan: RunPlan,
    options: PlaywrightRealOptions,
    featureDir: string,
  ) => Promise<RealDriverResult>,
  config: SelfHealConfig = { maxAttempts: 3, backoffMs: 2000 },
): Promise<RealDriverResult> {
  const startedAt = new Date();
  let lastError: unknown = new Error("No attempts executed");
  let lastResult: RealDriverResult | null = null;
  let nextPlan = plan;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      lastResult = await executeFn(nextPlan, options, featureDir);
      if (lastResult.record.status === "passed") {
        return lastResult;
      }
      nextPlan = planWithFallbackSelector(nextPlan, failureOutput(lastResult));
    } catch (error) {
      lastError = error;
      nextPlan = planWithFallbackSelector(nextPlan, errorMessage(error));
    }

    if (attempt < config.maxAttempts && config.backoffMs > 0) {
      await delay(config.backoffMs * attempt);
    }
  }

  return lastResult ?? failedResultFromError(plan, lastError, startedAt);
}
