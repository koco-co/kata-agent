import { describe, expect, test } from "bun:test";
import type {
  ArtifactRef,
  FlowSpec,
  RunRecord,
  TestSpec,
} from "../packages/domain/src/index";
import { validateSchema } from "../packages/domain/src/index";
import {
  buildEvidencePackFromRunRecord,
  buildFlowSpecFromTestSpec,
  buildRunPlanFromFlowSpec,
  renderAutomationReportMarkdown,
} from "../packages/workflow-engine/src/index";

function ref(type: string): ArtifactRef {
  return {
    id: `${type}:1`,
    type,
    path: `${type.toLowerCase()}.json`,
    schemaVersion: "0.1",
    createdBy: "test",
    createdAt: "2026-05-01T00:00:00.000Z",
    hash: "sha256:test",
  };
}

function testSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置",
    requirementRef: "RequirementSpec:1",
    status: "reviewed",
    modules: [
      {
        id: "M1",
        name: "规则",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "展示保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "text",
                target: "[role=status]",
                expected: "保存成功",
                requirementRefs: ["REQ-001", "REQ-002"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: { requirementRefs: ["REQ-001"], sourceRefs: [] },
          },
          {
            id: "TC-002",
            title: "移动端保存规则成功",
            priority: "P1",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-002",
                action: "点击保存按钮",
                expected: "展示保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-002",
                layer: "L3",
                kind: "text",
                target: "[role=status]",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "mobile",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: { requirementRefs: ["REQ-001"], sourceRefs: [] },
          },
        ],
      },
    ],
  };
}

function failedRunRecord(): RunRecord {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    runId: "run-1",
    runner: "playwright",
    status: "failed",
    startedAt: "2026-05-01T00:00:00.000Z",
    finishedAt: "2026-05-01T00:00:02.000Z",
    caseResults: [
      {
        testCaseId: "TC-001",
        status: "failed",
        assertionResults: [
          {
            assertionId: "ASSERT-001",
            status: "failed",
            expected: "保存成功",
            actual: "保存失败",
            message: "Expected toast to contain 保存成功",
          },
        ],
      },
    ],
    evidenceFiles: ["automation/evidence/run-log.txt"],
  };
}

describe("automation artifact builders", () => {
  test("buildFlowSpecFromTestSpec builds flows from ready web cases", () => {
    const flow = buildFlowSpecFromTestSpec(ref("TestSpec"), testSpec());

    expect(flow.project).toBe("demo");
    expect(flow.sourceTestSpecRef).toBe("TestSpec:1");
    expect(flow.flows).toHaveLength(1);
    expect(flow.flows[0]?.surface).toBe("web");
    expect(flow.flows[0]?.testCaseId).toBe("TC-001");
    expect(flow.flows[0]?.steps[0]?.target).toBe("点击保存按钮");
    expect(flow.flows[0]?.steps[0]?.target).not.toBe("[role=status]");
    expect(flow.flows[0]?.assertions[0]?.expected).toBe("保存成功");
    expect(flow.flows[0]?.assertions[0]?.requirementRefs).toEqual([
      "REQ-001",
      "REQ-002",
    ]);
    expect(validateSchema("FlowSpec", flow).valid).toBe(true);
  });

  test("buildRunPlanFromFlowSpec emits clicks for English click steps", () => {
    const flow: FlowSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceTestSpecRef: "TestSpec:1",
      flows: [
        {
          id: "FLOW-001",
          title: "保存规则成功",
          testCaseId: "TC-001",
          priority: "P0",
          surface: "web",
          entry: { url: "/rule-config" },
          steps: [
            {
              id: "STEP-001",
              action: "click",
              target: "button:保存",
              expected: "展示保存成功提示",
              assertionRefs: ["ASSERT-001"],
            },
          ],
          assertions: [
            {
              id: "ASSERT-001",
              layer: "L3",
              kind: "text",
              target: "[role=status]",
              expected: "保存成功",
              requirementRefs: ["REQ-001"],
            },
          ],
        },
      ],
    };

    const { script } = buildRunPlanFromFlowSpec(ref("FlowSpec"), flow, "mock");

    expect(script).toContain('await page.locator("text=保存").click();');
  });

  test("buildRunPlanFromFlowSpec creates a Playwright run plan and script", () => {
    const flow = buildFlowSpecFromTestSpec(ref("TestSpec"), testSpec());
    const { plan, script } = buildRunPlanFromFlowSpec(
      ref("FlowSpec"),
      flow,
      "mock",
    );

    expect(plan.runner).toBe("playwright");
    expect(plan.scriptPath).toBe("automation/playwright/generated.spec.ts");
    expect(script).toContain('test("保存规则成功"');
    expect(script).toContain("await expect");
    expect(validateSchema("RunPlan", plan).valid).toBe(true);
  });

  test("buildEvidencePackFromRunRecord maps evidence files", () => {
    const evidence = buildEvidencePackFromRunRecord(
      ref("RunRecord"),
      failedRunRecord(),
    );

    expect(evidence.runRecordRef).toBe("RunRecord:1");
    expect(evidence.evidence[0]?.kind).toBe("run-log");
    expect(evidence.evidence[0]?.path).toBe("automation/evidence/run-log.txt");
    expect(evidence.evidence[0]?.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateSchema("EvidencePack", evidence).valid).toBe(true);
  });

  test("buildEvidencePackFromRunRecord classifies semantic txt evidence", () => {
    const record = failedRunRecord();
    record.evidenceFiles = [
      "automation/evidence/console.txt",
      "automation/evidence/network.txt",
      "automation/evidence/dom-snapshot.txt",
    ];

    const evidence = buildEvidencePackFromRunRecord(ref("RunRecord"), record);

    expect(evidence.evidence.map((item) => item.kind)).toEqual([
      "console",
      "network",
      "dom-snapshot",
    ]);
    expect(validateSchema("EvidencePack", evidence).valid).toBe(true);
  });

  test("renderAutomationReportMarkdown includes failures", () => {
    const markdown = renderAutomationReportMarkdown(failedRunRecord());

    expect(markdown).toContain("# Automation Report");
    expect(markdown).toContain("TC-001");
    expect(markdown).toContain("Expected toast to contain 保存成功");
  });
});
