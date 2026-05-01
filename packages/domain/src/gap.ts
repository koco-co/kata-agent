export const GAP_CATEGORIES = [
  "business-goal",
  "user-role",
  "entry-path",
  "page-structure",
  "ui-copy",
  "field-rule",
  "interaction-flow",
  "state-flow",
  "data-rule",
  "exception-rule",
  "permission-rule",
  "compatibility",
  "non-functional",
  "dependency",
  "conflict",
  "automation-blocker",
] as const;

export type GapCategory = (typeof GAP_CATEGORIES)[number];
export type GapSeverity = "P0" | "P1" | "P2" | "P3";

export interface RequirementGap {
  id: string;
  category: GapCategory;
  severity: GapSeverity;
  evidence: string;
  impact: string;
  question: string;
  suggestedDefault?: string;
  sourceRefs: string[];
}

export interface RequirementGapReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  gaps: RequirementGap[];
}
