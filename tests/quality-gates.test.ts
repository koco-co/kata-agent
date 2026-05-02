import { describe, expect, test } from "bun:test";
import {
  checkAutomationReadiness,
  checkArtifactConsistency,
  checkRequirementClarity,
  checkRuleStoreCompliance,
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

  test("reports raw source hash mismatches when raw content is available", () => {
    const source: RequirementSourceBundle = {
      schemaVersion: "0.1",
      sourceType: "lanhu",
      sourceUrl: "mock://source",
      title: "规则配置",
      textBlocks: [{ id: "SRC-001", content: "保存按钮" }],
      images: [],
      rawFiles: [
        {
          id: "RAW-001",
          path: "sources/lanhu/raw.txt",
          mediaType: "text/plain",
          hash: "sha256:not-the-real-hash",
        },
      ],
      fetchedAt: "2026-05-02T00:00:00.000Z",
    };

    const result = checkSourceIntegrity(source, {
      rawFileContents: { "sources/lanhu/raw.txt": "actual raw source" },
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContainEqual({
      id: "RAW-001",
      severity: "error",
      message: "Raw source file hash mismatch: sources/lanhu/raw.txt",
    });
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

  test("warns on unresolved P1 gaps unless they are assumed or tracked as open items", () => {
    const gaps: RequirementGapReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      gaps: [
        {
          id: "GAP-P1",
          category: "interaction-flow",
          severity: "P1",
          evidence: "missing",
          impact: "risky",
          question: "取消后是否回到列表?",
          sourceRefs: [],
        },
      ],
    };
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [],
    };
    const result = checkRequirementClarity(gaps, confirmation);

    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([
      {
        id: "GAP-P1",
        severity: "warning",
        message: "Unresolved P1 gap: 取消后是否回到列表?",
      },
    ]);

    expect(
      checkRequirementClarity(gaps, {
        schemaVersion: "0.1",
        answers: [
          { questionId: "GAP-P1", status: "assumed", answer: "返回列表" },
        ],
      }).violations,
    ).toEqual([]);
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

  test("blocks ready critical cases without executable steps or concrete expectations", () => {
    const requirement: RequirementSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [],
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
              priority: "P1",
              requirementRefs: ["REQ-001"],
              steps: [
                {
                  id: "STEP-001",
                  action: " ",
                  expected: " ",
                  requirementRefs: ["REQ-001"],
                },
              ],
              assertions: [
                {
                  id: "ASSERT-001",
                  layer: "L3",
                  kind: "ui-copy",
                  target: " ",
                  expected: " ",
                  requirementRefs: ["REQ-001"],
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
          ],
        },
      ],
    };

    const result = checkAutomationReadiness(spec, requirement);

    expect(result.passed).toBe(false);
    expect(result.violations.map((violation) => violation.id)).toEqual([
      "TC-001:step-action",
      "TC-001:step-expected",
      "ASSERT-001:target",
      "ASSERT-001:expected",
    ]);
  });

  test("blocks blocked automation cases without blocker reasons", () => {
    const requirement: RequirementSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    };
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
              steps: [],
              assertions: [],
              automation: {
                surface: "web",
                readiness: "blocked",
                uiContractRefs: [],
                blockers: [],
              },
              traceability: { requirementRefs: ["REQ-001"], sourceRefs: [] },
            },
          ],
        },
      ],
    };

    expect(checkAutomationReadiness(spec, requirement).violations).toContainEqual({
      id: "TC-001:blocker",
      severity: "error",
      message: "Blocked automation case must include blocker reason",
    });
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

  test("blocks stale markdown and artifact hash consistency violations", () => {
    const spec: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: [],
    };
    const xmind: XMindExport = {
      schemaVersion: "0.1",
      outputPath: "exports/xmind/test-spec.xmind",
      caseCount: 0,
    };

    const result = checkArtifactConsistency(spec, xmind, {
      markdownArtifacts: [
        {
          id: "test-spec-md",
          path: "test-spec/test-spec.md",
          expected: "# Test Spec\n",
          actual: "# stale\n",
        },
      ],
      hashViolations: [
        {
          id: "test-spec-json",
          severity: "error",
          message: "Artifact hash mismatch: test-spec/test-spec.json",
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.violations.map((violation) => violation.id)).toEqual([
      "test-spec-md",
      "test-spec-json",
    ]);
  });

  test("blocks disabled non-negotiable hard rules", () => {
    const result = checkRuleStoreCompliance([
      {
        id: "no-hardcoded-credentials",
        description: "no credentials",
        enabled: false,
        source: "run",
        nonNegotiable: true,
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([
      {
        id: "no-hardcoded-credentials",
        severity: "error",
        message: "Non-negotiable hard rule is disabled: no credentials",
      },
    ]);
  });
});
