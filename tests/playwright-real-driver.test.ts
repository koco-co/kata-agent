import { describe, expect, test } from "bun:test";
import { executeRunPlan } from "../plugins/playwright/src/real";

describe("real playwright driver", () => {
  test("throws when no browser is installed", async () => {
    await expect(
      executeRunPlan(
        {
          schemaVersion: "0.1",
          project: "demo",
          feature: "rule-config",
          runner: "playwright",
          mode: "real",
          sourceFlowSpecRef: "FlowSpec:test",
          scriptPath: "nonexistent.spec.ts",
          flows: [],
        },
        {
          browserType: "chromium",
          headless: true,
          screenshotOnFailure: true,
          screenshotOnPass: false,
          collectConsoleLogs: true,
          timeout: 30000,
          retryCount: 0,
        },
      ),
    ).rejects.toThrow(/browser|executable|not found/i);
  });
});
