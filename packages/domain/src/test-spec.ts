export type TestAssertionLayer = "L1" | "L2" | "L3" | "L4" | "L5";

export interface TestSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  requirementRef: string;
  status: "draft" | "reviewed" | "blocked";
  modules: Array<{
    id: string;
    name: string;
    requirementRefs: string[];
    cases: Array<{
      id: string;
      title: string;
      priority: "P0" | "P1" | "P2";
      requirementRefs: string[];
      steps: Array<{
        id: string;
        action: string;
        expected: string;
        requirementRefs: string[];
      }>;
      assertions: Array<{
        id: string;
        layer: TestAssertionLayer;
        kind: string;
        target: string;
        expected: string;
        requirementRefs: string[];
      }>;
      automation: {
        surface: "web" | "mobile" | "desktop" | "api";
        readiness: "ready" | "partial" | "blocked" | "manual-only";
        uiContractRefs: string[];
        blockers: Array<{
          type: string;
          message: string;
          relatedOpenItem?: string;
        }>;
      };
      traceability: { requirementRefs: string[]; sourceRefs: string[] };
    }>;
  }>;
}

export interface TestSpecAuthorInput {
  schemaVersion: "0.1";
  testPointSetRef: string;
  requirementSpecRef: string;
}

export interface TestSpecReviewerInput {
  schemaVersion: "0.1";
  testSpecRef: string;
  requirementSpecRef: string;
}
