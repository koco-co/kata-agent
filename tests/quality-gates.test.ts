import { describe, expect, test } from "bun:test";
import {
  checkAutomationReadiness,
  checkArtifactConsistency,
  checkRequirementClarity,
  checkSourceIntegrity,
  checkTestSpecValidity,
} from "../packages/workflow-engine/src/index";
import type {
  ConfirmationResult,
  RequirementGapReport,
  RequirementSpec,
  RequirementSourceBundle,
  TestSpec,
  XMindExport,
} from "../packages/domain/src/index";

describe("quality gates", () => {
  test("blocks unusable requirement sources", () => {
    const source: RequirementSourceBundle = {
      schemaVersion: "0.1",
      sourceType: "lanhu",
      sourceUrl: "mock://empty",
      textBlocks: [],
      images: [],
      rawFiles: [],
      fetchedAt: "2026-05-02T00:00:00.000Z",
    };

    const result = checkSourceIntegrity(source);

    expect(result.passed).toBe(false);
    expect(result.gateId).toBe("source-integrity");
    expect(result.violations.map((violation) => violation.id)).toEqual([
      "source-title",
      "source-content",
      "source-raw-files",
    ]);
  });

  test("blocks unresolved P0 requirement gaps", () => {
    const gaps: RequirementGapReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      gaps: [
        {
          id: "GAP-001",
          category: "ui-copy",
          severity: "P0",
          evidence: "missing",
          impact: "blocks automation",
          question: "保存还是确定?",
          sourceRefs: [],
        },
      ],
    };
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [],
    };
    expect(checkRequirementClarity(gaps, confirmation).passed).toBe(false);
  });

  test("blocks P0 requirement gaps answered only by assumptions", () => {
    const gaps: RequirementGapReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      gaps: [
        {
          id: "GAP-001",
          category: "ui-copy",
          severity: "P0",
          evidence: "missing",
          impact: "blocks automation",
          question: "保存还是确定?",
          sourceRefs: [],
        },
      ],
    };
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [
        { questionId: "GAP-001", status: "assumed", answer: "保存" },
      ],
    };
    expect(checkRequirementClarity(gaps, confirmation).passed).toBe(false);
  });

  test("blocks ready P0 cases without assertions", () => {
    const requirement: RequirementSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [
        {
          id: "REQ-001",
          text: "用户可以创建规则",
          severity: "P0",
          sourceType: "source",
          sourceRefs: ["SRC-001"],
        },
      ],
      pageContracts: [{ id: "PAGE-001", name: "规则配置", surface: "web" }],
      openItems: [],
      assumptions: [],
    };
    const spec: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "draft",
      modules: [
        {
          id: "M1",
          name: "创建",
          requirementRefs: [],
          cases: [
            {
              id: "TC-001",
              title: "创建规则",
              priority: "P0",
              requirementRefs: ["REQ-001"],
              steps: [],
              assertions: [],
              automation: {
                surface: "web",
                readiness: "ready",
                uiContractRefs: ["PAGE-001"],
                blockers: [],
              },
              traceability: { requirementRefs: [], sourceRefs: [] },
            },
          ],
        },
      ],
    };
    expect(checkAutomationReadiness(spec, requirement).passed).toBe(false);
    expect(checkTestSpecValidity(spec).passed).toBe(false);
  });

  test("blocks XMind exports whose case count does not match TestSpec", () => {
    const spec: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: [
        {
          id: "M1",
          name: "创建",
          requirementRefs: ["REQ-001"],
          cases: [
            {
              id: "TC-001",
              title: "创建规则",
              priority: "P0",
              requirementRefs: ["REQ-001"],
              steps: [
                {
                  id: "STEP-001",
                  action: "点击保存",
                  expected: "保存成功",
                  requirementRefs: ["REQ-001"],
                },
              ],
              assertions: [
                {
                  id: "ASSERT-001",
                  layer: "L1",
                  kind: "text",
                  target: "toast",
                  expected: "保存成功",
                  requirementRefs: ["REQ-001"],
                },
              ],
              automation: {
                surface: "web",
                readiness: "ready",
                uiContractRefs: ["PAGE-001"],
                blockers: [],
              },
              traceability: {
                requirementRefs: ["REQ-001"],
                sourceRefs: ["SRC-001"],
              },
            },
          ],
        },
      ],
    };
    const xmind: XMindExport = {
      schemaVersion: "0.1",
      outputPath: "exports/xmind/test-spec.xmind",
      caseCount: 0,
    };

    const result = checkArtifactConsistency(spec, xmind);

    expect(result.passed).toBe(false);
    expect(result.gateId).toBe("artifact-consistency");
    expect(result.violations).toEqual([
      {
        id: "xmind-case-count",
        severity: "error",
        message: "XMind case count 0 does not match TestSpec case count 1",
      },
    ]);
  });
});
