import { describe, expect, test } from "bun:test";
import {
  checkAutomationReadiness,
  checkRequirementClarity,
  checkTestSpecValidity,
} from "../packages/workflow-engine/src/index";
import type {
  ConfirmationResult,
  RequirementGapReport,
  RequirementSpec,
  TestSpec,
} from "../packages/domain/src/index";

describe("quality gates", () => {
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
});
