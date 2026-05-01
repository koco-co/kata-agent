import type {
  ArtifactRef,
  ClarificationDossier,
  ConfirmationDraft,
  DesignReport,
  RequirementAnalysisInput,
  RequirementAuthorInput,
  TestSpecAuthorInput,
  TestSpecReviewerInput,
} from "../../domain/src/index";
import type { GateResult } from "./gates";
import type { TraceEvent } from "./types";

export function buildRequirementAnalysisInput(
  requirementDraftRef: ArtifactRef,
  knowledgeConsultRef: ArtifactRef,
): RequirementAnalysisInput {
  return {
    schemaVersion: "0.1",
    requirementDraftRef: requirementDraftRef.id,
    knowledgeConsultRef: knowledgeConsultRef.id,
  };
}

export function buildRequirementAuthorInput(
  requirementDraftRef: ArtifactRef,
  gapReportRef: ArtifactRef,
  clarificationDossierRef: ArtifactRef,
  confirmationResultRef: ArtifactRef,
): RequirementAuthorInput {
  return {
    schemaVersion: "0.1",
    requirementDraftRef: requirementDraftRef.id,
    gapReportRef: gapReportRef.id,
    clarificationDossierRef: clarificationDossierRef.id,
    confirmationResultRef: confirmationResultRef.id,
  };
}

export function buildTestSpecAuthorInput(
  testPointSetRef: ArtifactRef,
  requirementSpecRef: ArtifactRef,
): TestSpecAuthorInput {
  return {
    schemaVersion: "0.1",
    testPointSetRef: testPointSetRef.id,
    requirementSpecRef: requirementSpecRef.id,
  };
}

export function buildTestSpecReviewerInput(
  testSpecRef: ArtifactRef,
  requirementSpecRef: ArtifactRef,
): TestSpecReviewerInput {
  return {
    schemaVersion: "0.1",
    testSpecRef: testSpecRef.id,
    requirementSpecRef: requirementSpecRef.id,
  };
}

export function renderConfirmationDraft(
  dossierRef: ArtifactRef,
  dossier: ClarificationDossier,
): { draft: ConfirmationDraft; markdown: string } {
  const lines = [
    "# 需求澄清确认",
    "",
    dossier.summary,
    "",
    ...dossier.questions.map(
      (question) =>
        `- [${question.severity}] ${question.id}: ${question.question}`,
    ),
  ];
  return {
    draft: {
      schemaVersion: "0.1",
      clarificationDossierRef: dossierRef.id,
      renderedMarkdownPath: "requirement/clarifications/confirmation-draft.md",
      renderedAt: new Date().toISOString(),
    },
    markdown: `${lines.join("\n")}\n`,
  };
}

export function buildDesignReport(
  artifactRefs: ArtifactRef[],
  gateResults: GateResult[],
  traceEvents: TraceEvent[],
): DesignReport {
  return {
    schemaVersion: "0.1",
    summary: `Generated ${artifactRefs.length} artifacts and ${traceEvents.length} trace events.`,
    artifactRefs: artifactRefs.map((ref) => ref.id),
    gateResults: gateResults.map((result) => ({
      gateId: result.gateId ?? "unknown",
      passed: result.passed,
      violations: result.violations,
    })),
  };
}
