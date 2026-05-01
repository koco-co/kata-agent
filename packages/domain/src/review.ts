export interface ReviewReport {
  schemaVersion: "0.1";
  passed: boolean;
  violations: Array<{
    id: string;
    severity: "error" | "warning";
    message: string;
    artifactRef?: string;
  }>;
}

export interface XMindExport {
  schemaVersion: "0.1";
  outputPath: string;
  caseCount: number;
}

export interface DesignReport {
  schemaVersion: "0.1";
  summary: string;
  artifactRefs: string[];
  gateResults: Array<{
    gateId: string;
    passed: boolean;
    violations: Array<{
      id: string;
      severity: "error" | "warning";
      message: string;
    }>;
  }>;
}
