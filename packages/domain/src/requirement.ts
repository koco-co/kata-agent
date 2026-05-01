export interface RawSourceFile {
  id: string;
  path: string;
  mediaType: string;
  hash: string;
}

export interface RequirementSourceBundle {
  schemaVersion: "0.1";
  sourceType: "lanhu" | "markdown" | "text";
  sourceUrl?: string;
  title?: string;
  textBlocks: Array<{ id: string; title?: string; content: string }>;
  images: Array<{
    id: string;
    path: string;
    caption?: string;
    sourceUrl?: string;
  }>;
  rawFiles: RawSourceFile[];
  fetchedAt: string;
}

export interface LanhuFetchInput {
  url: string;
  cookieEnv?: "LANHU_COOKIE";
  outputDir: string;
}

export interface TestCaseGenInput {
  project: string;
  feature: string;
  source: { type: "lanhu"; url: string };
}

export interface RequirementDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  facts: Array<{ id: string; content: string; sourceRefs: string[] }>;
}

export interface KnowledgeConsultResult {
  schemaVersion: "0.1";
  query: string;
  snippets: Array<{
    id: string;
    source: string;
    content: string;
    relevance: "high" | "medium" | "low";
  }>;
}

export interface RequirementAnalysisInput {
  schemaVersion: "0.1";
  requirementDraftRef: string;
  knowledgeConsultRef: string;
}

export interface ClarificationDossier {
  schemaVersion: "0.1";
  summary: string;
  questions: Array<{
    id: string;
    severity: "P0" | "P1" | "P2" | "P3";
    category: string;
    question: string;
    impact: string;
    suggestedDefault?: string;
    requiresProductAnswer: boolean;
  }>;
  assumptions: Array<{
    id: string;
    content: string;
    risk: "low" | "medium" | "high";
  }>;
}

/** A render reference: confirmation-draft.md is the rendered view of the dossier; no new facts. */
export interface ConfirmationDraft {
  schemaVersion: "0.1";
  clarificationDossierRef: string;
  renderedMarkdownPath: string;
  renderedAt: string;
}

export interface ConfirmationResult {
  schemaVersion: "0.1";
  answers: Array<{
    questionId: string;
    status: "confirmed" | "rejected" | "assumed" | "unanswered";
    answer?: string;
  }>;
}

export interface RequirementAuthorInput {
  schemaVersion: "0.1";
  requirementDraftRef: string;
  gapReportRef: string;
  clarificationDossierRef: string;
  confirmationResultRef: string;
}

export type OpenItemStatus =
  | "unconfirmed"
  | "confirmed"
  | "assumed"
  | "deferred";

export interface RequirementSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  status: "draft" | "confirmed" | "assumed" | "blocked";
  rules: Array<{
    id: string;
    text: string;
    severity: "P0" | "P1" | "P2" | "P3";
    sourceType: "source" | "confirmation" | "assumption" | "unknown";
    sourceRefs: string[];
    confirmationQuestionId?: string;
    assumptionRef?: string;
  }>;
  pageContracts: Array<{
    id: string;
    name: string;
    surface: "web" | "mobile" | "desktop" | "api";
  }>;
  openItems: Array<{
    id: string;
    severity: "P0" | "P1" | "P2" | "P3";
    status: OpenItemStatus;
    question: string;
  }>;
  assumptions: Array<{
    id: string;
    content: string;
    risk: "low" | "medium" | "high";
  }>;
}
