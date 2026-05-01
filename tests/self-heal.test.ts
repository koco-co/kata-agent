import { describe, expect, test } from "bun:test";
import { selfHealingRun } from "../plugins/playwright/src/self-heal";
import type { PlaywrightRealOptions, RunPlan } from "@kata-agent/domain";
import type { RealDriverResult } from "../plugins/playwright/src/real";

const options: PlaywrightRealOptions = {
  browserType: "chromium",
  headless: true,
  screenshotOnFailure: true,
  screenshotOnPass: false,
  collectConsoleLogs: true,
  timeout: 1000,
  retryCount: 3,
};

function driverResult(
  plan: RunPlan,
  status: "passed" | "failed",
  runId = `RUN-${status}`,
): RealDriverResult {
  const now = new Date().toISOString();
  return {
    record: {
      schemaVersion: "0.1",
      project: plan.project,
      feature: plan.feature,
      runId,
      runner: "playwright",
      status,
      startedAt: now,
      finishedAt: now,
      caseResults: [],
      evidenceFiles: [],
    },
    evidence: {
      schemaVersion: "0.1",
      project: plan.project,
      feature: plan.feature,
      runRecordRef: `RunRecord:${runId}`,
      evidence: [],
    },
  };
}

function runPlan(selector = "[data-testid=save]", expected = "保存"): RunPlan {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "checkout",
    runner: "playwright",
    mode: "real",
    sourceFlowSpecRef: "FlowSpec:checkout",
    scriptPath: "checkout.spec.ts",
    flows: [
      {
        flowId: "FLOW-001",
        testCaseId: "TC-001",
        title: "save",
        entryUrl: "/",
        steps: [
          {
            id: "STEP-001",
            action: "click",
            selector,
            expected,
          },
        ],
        assertions: [
          {
            id: "ASSERT-001",
            layer: "L3",
            kind: "text",
            selector,
            expected,
          },
        ],
      },
    ],
  };
}

describe("self-healing retry", () => {
  test("retries up to maxAttempts on transient failure", async () => {
    let attempts = 0;
    const result = await selfHealingRun(
      {
        flows: [
          {
            flowId: "FLOW-001",
            testCaseId: "TC-001",
            title: "test",
            entryUrl: "/",
            steps: [],
            assertions: [],
          },
        ],
      } as unknown as RunPlan,
      options,
      "/tmp",
      async () => {
        attempts++;
        throw new Error("transient");
      },
    );
    expect(attempts).toBe(3);
    expect(result.record.status).toBe("failed");
  }, 8_000);

  test("analyzes selector failures and retries with a cloned fallback selector", async () => {
    const plan = runPlan();
    const attemptedPlans: RunPlan[] = [];

    const result = await selfHealingRun(
      plan,
      options,
      "/tmp",
      async (attemptPlan) => {
        attemptedPlans.push(attemptPlan);
        if (attemptedPlans.length === 1) {
          throw new Error("Timeout waiting for selector [data-testid=save]");
        }

        return attemptPlan.flows[0]?.steps[0]?.selector ===
          "text=保存"
          ? driverResult(attemptPlan, "passed")
          : driverResult(attemptPlan, "failed");
      },
      { maxAttempts: 2, backoffMs: 0 },
    );

    expect(attemptedPlans).toHaveLength(2);
    expect(attemptedPlans[0]).toBe(plan);
    expect(attemptedPlans[1]).not.toBe(plan);
    expect(attemptedPlans[1]?.flows[0]?.steps[0]?.selector).toBe(
      "text=保存",
    );
    expect(plan.flows[0]?.steps[0]?.selector).toBe("[data-testid=save]");
    expect(result.record.status).toBe("passed");
  });

  test("matches full step selectors in failure output before healing", async () => {
    const plan = runPlan("input[name=email]", "alice@example.com");
    const attemptedPlans: RunPlan[] = [];

    await selfHealingRun(
      plan,
      options,
      "/tmp",
      async (attemptPlan) => {
        attemptedPlans.push(attemptPlan);
        if (attemptedPlans.length === 1) {
          throw new Error("Timeout waiting for input[name=email]");
        }

        return driverResult(attemptPlan, "failed");
      },
      { maxAttempts: 2, backoffMs: 0 },
    );

    expect(attemptedPlans).toHaveLength(2);
    expect(attemptedPlans[1]?.flows[0]?.steps[0]?.selector).toBe(
      "text=alice@example.com",
    );
    expect(plan.flows[0]?.steps[0]?.selector).toBe("input[name=email]");
  });

  test("returns immediately when an attempt passes", async () => {
    const plan = runPlan();
    let attempts = 0;

    const result = await selfHealingRun(
      plan,
      options,
      "/tmp",
      async (attemptPlan) => {
        attempts++;
        return driverResult(attemptPlan, "passed");
      },
      { maxAttempts: 3, backoffMs: 0 },
    );

    expect(attempts).toBe(1);
    expect(result.record.status).toBe("passed");
  });

  test("retries failed results and returns the final failed result", async () => {
    const plan = runPlan();
    let attempts = 0;

    const result = await selfHealingRun(
      plan,
      options,
      "/tmp",
      async (attemptPlan) => {
        attempts++;
        return driverResult(attemptPlan, "failed", `RUN-${attempts}`);
      },
      { maxAttempts: 3, backoffMs: 0 },
    );

    expect(attempts).toBe(3);
    expect(result.record.status).toBe("failed");
    expect(result.record.runId).toBe("RUN-3");
  });

  test("returns synthetic failed result with step error when all attempts throw", async () => {
    const plan = runPlan();

    const result = await selfHealingRun(
      plan,
      options,
      "/tmp",
      async () => {
        throw new Error("selector never appeared");
      },
      { maxAttempts: 2, backoffMs: 0 },
    );

    expect(result.record.status).toBe("failed");
    expect(result.record.caseResults[0]?.status).toBe("error");
    expect(result.record.caseResults[0]?.stepResults?.[0]?.status).toBe(
      "error",
    );
    expect(result.record.caseResults[0]?.stepResults?.[0]?.error).toContain(
      "selector never appeared",
    );
    expect(result.evidence.evidence).toEqual([]);
  });
});
