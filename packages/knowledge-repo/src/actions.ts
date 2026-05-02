import type {
  KnowledgeConsultResult,
  KnowledgeSuggestion,
  RequirementDraft,
  RequirementSpec,
} from "../../domain/src/index";
import { searchKnowledge, writeSuggestion, type KnowledgeLocation } from "./store";

export function consultKnowledge(
  input: RequirementDraft,
  location?: KnowledgeLocation,
): KnowledgeConsultResult {
  return {
    schemaVersion: "0.1",
    query: input.title,
    snippets: location ? searchKnowledge(location, input.title) : [],
  };
}

export function proposeKnowledge(
  input: RequirementSpec,
  rootDir: string,
): KnowledgeSuggestion[] {
  const suggestions = input.rules
    .filter((rule) => rule.sourceType === "confirmation")
    .map(
      (rule): KnowledgeSuggestion => ({
        schemaVersion: "0.1",
        category: "product-decision",
        confidence: "high",
        sourceArtifact: "requirement/spec/requirement-spec.json",
        content: rule.text,
        targetCategory: "decisions",
        reason: "confirmed requirement rule",
      }),
    );
  for (const suggestion of suggestions) {
    writeSuggestion({ rootDir, project: input.project }, suggestion);
  }
  return suggestions;
}
