import type { TestAssertionLayer } from "./test-spec";

export interface UiScriptGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  testSpecPath: string;
  mode?: "mock" | "real";
}

export type AutomationSurface = "web";
export type AutomationPriority = "P0" | "P1" | "P2";
export type FlowAssertionKind =
  | "text"
  | "url"
  | "visibility"
  | "network"
  | "state";
export type RunMode = "mock" | "real";
export type RunStatus = "passed" | "failed" | "blocked";
export type CaseRunStatus = "passed" | "failed" | "skipped" | "blocked";
export type EvidenceKind =
  | "screenshot"
  | "trace"
  | "console"
  | "network"
  | "dom-snapshot"
  | "run-log";

export interface FlowSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceTestSpecRef: string;
  flows: Array<{
    id: string;
    title: string;
    testCaseId: string;
    priority: AutomationPriority;
    surface: AutomationSurface;
    entry: { url: string };
    steps: Array<{
      id: string;
      action: string;
      target: string;
      expected: string;
      assertionRefs: string[];
    }>;
    assertions: Array<{
      id: string;
      layer: TestAssertionLayer;
      kind: FlowAssertionKind;
      target: string;
      expected: string;
      requirementRefs: string[];
    }>;
  }>;
}

export interface RunPlan {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runner: "playwright";
  mode: RunMode;
  sourceFlowSpecRef: string;
  scriptPath: string;
  flows: Array<{
    flowId: string;
    testCaseId: string;
    title: string;
    entryUrl: string;
    steps: Array<{
      id: string;
      action: string;
      selector: string;
      expected: string;
    }>;
    assertions: Array<{
      id: string;
      layer: TestAssertionLayer;
      kind: FlowAssertionKind;
      selector: string;
      expected: string;
    }>;
  }>;
}

export interface RunRecord {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  runner: "playwright";
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  caseResults: Array<{
    testCaseId: string;
    status: CaseRunStatus;
    assertionResults: Array<{
      assertionId: string;
      status: "passed" | "failed";
      expected: string;
      actual?: string;
      message?: string;
    }>;
  }>;
  evidenceFiles: string[];
}

export interface EvidencePack {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runRecordRef: string;
  evidence: Array<{
    id: string;
    kind: EvidenceKind;
    path: string;
    hash: string;
  }>;
}
