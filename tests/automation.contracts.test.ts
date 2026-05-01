import { describe, expect, test } from "bun:test";
import {
  SCHEMA_REGISTRY,
  validateSchema,
  type EvidencePack,
  type FlowSpec,
  type RunPlan,
  type RunRecord,
  type UiScriptGenInput,
} from "../packages/domain/src/index";

describe("automation domain contracts", () => {
  test("automation schemas are registered", () => {
    expect(SCHEMA_REGISTRY.UiScriptGenInput).toBe(
      "schemas/ui-script-gen-input.schema.json",
    );
    expect(SCHEMA_REGISTRY.FlowSpec).toBe("schemas/flow-spec.schema.json");
    expect(SCHEMA_REGISTRY.RunPlan).toBe("schemas/run-plan.schema.json");
    expect(SCHEMA_REGISTRY.RunRecord).toBe("schemas/run-record.schema.json");
    expect(SCHEMA_REGISTRY.EvidencePack).toBe(
      "schemas/evidence-pack.schema.json",
    );
  });

  test("accepts valid web automation artifacts", () => {
    const input: UiScriptGenInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      testSpecPath: "test-spec/test-spec.json",
      mode: "mock",
    };
    const flow: FlowSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceTestSpecRef: "TestSpec:test",
      flows: [
        {
          id: "FLOW-001",
          title: "保存规则",
          testCaseId: "TC-001",
          priority: "P0",
          surface: "web",
          entry: { url: "/rules" },
          steps: [
            {
              id: "STEP-001",
              action: "click",
              target: "button:保存",
              expected: "toast text is 保存成功",
              assertionRefs: ["ASSERT-001"],
            },
          ],
          assertions: [
            {
              id: "ASSERT-001",
              layer: "L3",
              kind: "text",
              target: "toast",
              expected: "保存成功",
              requirementRefs: ["REQ-001"],
            },
          ],
        },
      ],
    };
    const plan: RunPlan = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runner: "playwright",
      mode: "mock",
      sourceFlowSpecRef: "FlowSpec:test",
      scriptPath: "automation/playwright/generated.spec.ts",
      flows: [
        {
          flowId: "FLOW-001",
          testCaseId: "TC-001",
          title: "保存规则",
          entryUrl: "/rules",
          steps: [
            {
              id: "STEP-001",
              action: "click",
              selector: "text=保存",
              expected: "toast text is 保存成功",
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
    };
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "passed",
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:00:01.000Z",
      caseResults: [
        {
          testCaseId: "TC-001",
          status: "passed",
          assertionResults: [
            {
              assertionId: "ASSERT-001",
              status: "passed",
              expected: "保存成功",
            },
          ],
        },
      ],
      evidenceFiles: ["automation/evidence/run-log.txt"],
    };
    const evidence: EvidencePack = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:test",
      evidence: [
        {
          id: "EVID-001",
          kind: "run-log",
          path: "automation/evidence/run-log.txt",
          hash:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      ],
    };

    expect(validateSchema("UiScriptGenInput", input).valid).toBe(true);
    expect(validateSchema("FlowSpec", flow).valid).toBe(true);
    expect(validateSchema("RunPlan", plan).valid).toBe(true);
    expect(validateSchema("RunRecord", record).valid).toBe(true);
    expect(validateSchema("EvidencePack", evidence).valid).toBe(true);
  });

  test("allows ui-script-gen mode to be omitted but rejects bad mode", () => {
    const defaultModeInput: UiScriptGenInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      testSpecPath: "test-spec/test-spec.json",
    };

    expect(
      validateSchema("UiScriptGenInput", defaultModeInput).valid,
    ).toBe(true);
    expect(
      validateSchema("UiScriptGenInput", {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        testSpecPath: "test-spec/test-spec.json",
        mode: "dry-run",
      }).valid,
    ).toBe(false);
  });

  test("rejects non-web automation surfaces in v0.2", () => {
    const result = validateSchema("FlowSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceTestSpecRef: "TestSpec:test",
      flows: [
        {
          id: "FLOW-001",
          title: "移动端保存规则",
          testCaseId: "TC-001",
          priority: "P0",
          surface: "mobile",
          entry: { url: "/rules" },
          steps: [],
          assertions: [],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "must be equal to one of the allowed values",
    );
  });
});
