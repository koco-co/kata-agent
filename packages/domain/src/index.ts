export type { FeatureManifest, FeatureStatus } from "./feature";
export type { ArtifactRef } from "./artifact";
export { GAP_CATEGORIES } from "./gap";
export type {
  GapCategory,
  GapSeverity,
  RequirementGap,
  RequirementGapReport,
} from "./gap";
export type {
  ClarificationDossier,
  ConfirmationDraft,
  ConfirmationResult,
  KnowledgeConsultResult,
  LanhuFetchInput,
  OpenItemStatus,
  RawSourceFile,
  RequirementAnalysisInput,
  RequirementAuthorInput,
  RequirementDraft,
  RequirementSourceBundle,
  RequirementSpec,
  TestCaseGenInput,
} from "./requirement";
export type { TestPoint, TestPointSet } from "./test-point";
export type {
  TestAssertionLayer,
  TestSpec,
  TestSpecAuthorInput,
  TestSpecReviewerInput,
} from "./test-spec";
export type { DesignReport, ReviewReport, XMindExport } from "./review";
export type { KnowledgeSuggestion } from "./knowledge";
export type { BugReport, BugReportInput } from "./bug-report";
export type {
  AutomationPriority,
  AutomationSurface,
  CaseRunStatus,
  EvidenceKind,
  EvidencePack,
  FlowAssertionKind,
  FlowSpec,
  PlaywrightRealOptions,
  RealRunStatus,
  RealStepResult,
  RunMode,
  RunPlan,
  RunRecord,
  RunStatus,
  UiScriptGenInput,
} from "./automation";
export { SCHEMA_NAMES, SCHEMA_REGISTRY, type SchemaName } from "./schemas";
export {
  assertValidSchema,
  getSchemaValidator,
  validateSchema,
  type SchemaValidationResult,
} from "./validator";
