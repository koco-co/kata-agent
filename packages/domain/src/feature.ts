export type FeatureStatus =
  | "pending"
  | "in-progress"
  | "blocked"
  | "completed"
  | "archived";

export interface FeatureManifest {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title?: string;
  sourceUrl?: string;
  owner?: string;
  createdAt: string;
  status: FeatureStatus;
}
