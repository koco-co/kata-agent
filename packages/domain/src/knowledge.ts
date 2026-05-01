export interface KnowledgeSuggestion {
  schemaVersion: "0.1";
  category:
    | "business-rule"
    | "product-decision"
    | "surface-knowledge"
    | "pitfall";
  confidence: "high" | "medium" | "low";
  sourceArtifact: string;
  content: string;
  targetCategory?:
    | "terms"
    | "business-rules"
    | "modules"
    | "surfaces"
    | "pitfalls"
    | "decisions";
  targetSlug?: string;
  reason: string;
}
