import { describe, expect, test } from "bun:test";
import {
  buildDesignReport,
  buildRequirementAnalysisInput,
  buildRequirementAuthorInput,
  buildTestSpecAuthorInput,
  buildTestSpecReviewerInput,
  renderConfirmationDraft,
} from "../packages/workflow-engine/src/index";
import type {
  ArtifactRef,
  ClarificationDossier,
} from "../packages/domain/src/index";

function ref(type: string, path: string): ArtifactRef {
  return {
    id: `${type}:1`,
    type,
    path,
    schemaVersion: "0.1",
    createdBy: "test",
    createdAt: "2026-05-01T00:00:00.000Z",
    hash: "sha256:test",
  };
}

describe("workflow artifact builders", () => {
  test("builds wrapper inputs from artifact refs", () => {
    const draft = ref("RequirementDraft", "requirement/drafts/requirement-draft.json");
    const consult = ref("KnowledgeConsultResult", "knowledge-consult-result.json");
    const gap = ref("RequirementGapReport", "requirement-gap-report.json");
    const dossier = ref("ClarificationDossier", "clarification-dossier.json");
    const confirmation = ref("ConfirmationResult", "confirmation-result.json");
    const points = ref("TestPointSet", "test-points.json");
    const requirement = ref("RequirementSpec", "requirement-spec.json");
    const spec = ref("TestSpec", "test-spec.json");

    expect(
      buildRequirementAnalysisInput(draft, consult).knowledgeConsultRef,
    ).toBe("KnowledgeConsultResult:1");
    expect(
      buildRequirementAuthorInput(draft, gap, dossier, confirmation)
        .clarificationDossierRef,
    ).toBe("ClarificationDossier:1");
    expect(buildTestSpecAuthorInput(points, requirement).requirementSpecRef).toBe(
      "RequirementSpec:1",
    );
    expect(buildTestSpecReviewerInput(spec, requirement).testSpecRef).toBe(
      "TestSpec:1",
    );
  });

  test("renders confirmation draft without adding new facts", () => {
    const dossierRef = ref(
      "ClarificationDossier",
      "requirement/clarifications/clarification-dossier.json",
    );
    const dossier: ClarificationDossier = {
      schemaVersion: "0.1",
      summary: "需要确认保存按钮文案。",
      questions: [
        {
          id: "GAP-001",
          severity: "P0",
          category: "ui-copy",
          question: "按钮文案是保存还是确定?",
          impact: "影响测试断言",
          requiresProductAnswer: true,
        },
      ],
      assumptions: [],
    };
    const rendered = renderConfirmationDraft(dossierRef, dossier);
    expect(rendered.draft.clarificationDossierRef).toBe("ClarificationDossier:1");
    expect(rendered.markdown).toContain("按钮文案是保存还是确定?");
  });

  test("builds design report from artifacts, gates, and trace", () => {
    const report = buildDesignReport(
      [ref("TestSpec", "test-spec/test-spec.json")],
      [{ gateId: "requirement-test-readiness", passed: true, violations: [] }],
      [
        {
          runId: "run-1",
          nodeId: "write-design-report",
          type: "enter",
          at: "2026-05-01T00:00:00.000Z",
        },
      ],
    );
    expect(report.summary).toContain("Generated 1 artifacts");
    expect(report.gateResults[0]?.gateId).toBe("requirement-test-readiness");
  });
});
