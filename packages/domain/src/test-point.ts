export interface TestPoint {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  requirementRefs: string[];
  risk: "low" | "medium" | "high";
}

export interface TestPointSet {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  points: TestPoint[];
}
