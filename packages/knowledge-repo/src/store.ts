import { randomUUID } from "node:crypto";
import {
  existsSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import type { KnowledgeSuggestion } from "../../domain/src/index";

export interface KnowledgeLocation {
  rootDir: string;
  project: string;
}

function assertProjectSegment(project: string): void {
  if (
    project === "" ||
    project === "." ||
    project === ".." ||
    project.includes("/") ||
    project.includes("\\") ||
    /^[a-z]:/i.test(project)
  ) {
    throw new Error("Knowledge location project must be a single path segment");
  }
}

export function knowledgeDir(location: KnowledgeLocation): string {
  assertProjectSegment(location.project);
  return join(location.rootDir, "projects", location.project, "knowledge");
}

export function writeSuggestion(
  location: KnowledgeLocation,
  suggestion: KnowledgeSuggestion,
): string {
  const dir = join(knowledgeDir(location), "suggestions");
  mkdirSync(dir, { recursive: true });
  const path = join(
    dir,
    `${Date.now()}-${randomUUID().slice(0, 8)}-${suggestion.category}.json`,
  );
  writeFileSync(path, JSON.stringify(suggestion, null, 2));
  return path;
}

export function readSuggestion(path: string): KnowledgeSuggestion {
  return JSON.parse(readFileSync(path, "utf8")) as KnowledgeSuggestion;
}

export function listSuggestions(location: KnowledgeLocation): string[] {
  const dir = join(knowledgeDir(location), "suggestions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => join(dir, entry))
    .sort();
}

export interface KnowledgeDecisionResult {
  archivedPath: string;
}

export interface KnowledgeAcceptResult extends KnowledgeDecisionResult {
  targetPath: string;
}

export interface KnowledgeSearchSnippet {
  id: string;
  source: string;
  content: string;
  relevance: "high" | "medium" | "low";
}

const KNOWLEDGE_CATEGORIES = new Set([
  "terms",
  "business-rules",
  "modules",
  "surfaces",
  "pitfalls",
  "decisions",
]);

export function acceptSuggestion(
  location: KnowledgeLocation,
  suggestionPath: string,
): KnowledgeAcceptResult {
  assertSuggestionPath(location, suggestionPath);
  const suggestion = readSuggestion(suggestionPath);
  const category = targetKnowledgeCategory(suggestion);
  const slug = safeSlug(
    suggestion.targetSlug ?? suggestion.content.slice(0, 48),
  );
  const relativeTarget = `${category}/${slug}.md`;
  const targetPath = join(knowledgeDir(location), relativeTarget);
  mkdirSync(join(knowledgeDir(location), category), { recursive: true });
  writeFileSync(targetPath, renderKnowledgeRecord(suggestion));
  updateKnowledgeIndex(location, {
    id: relativeTarget,
    path: relativeTarget,
    category,
    sourceArtifact: suggestion.sourceArtifact,
    acceptedAt: new Date().toISOString(),
  });
  const archivedPath = archiveSuggestion(location, suggestionPath, "accepted", {
    decision: "accepted",
    targetPath: relativeTarget,
    suggestion,
  });
  return { targetPath, archivedPath };
}

export function rejectSuggestion(
  location: KnowledgeLocation,
  suggestionPath: string,
  rejectionReason: string,
): KnowledgeDecisionResult {
  assertSuggestionPath(location, suggestionPath);
  const suggestion = readSuggestion(suggestionPath);
  const archivedPath = archiveSuggestion(location, suggestionPath, "rejected", {
    decision: "rejected",
    rejectionReason,
    suggestion,
  });
  return { archivedPath };
}

export function searchKnowledge(
  location: KnowledgeLocation,
  query: string,
): KnowledgeSearchSnippet[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const root = knowledgeDir(location);
  const snippets: KnowledgeSearchSnippet[] = [];
  for (const category of KNOWLEDGE_CATEGORIES) {
    const dir = join(root, category);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const relativePath = `${category}/${entry}`;
      const content = readFileSync(join(dir, entry), "utf8");
      if (!content.toLowerCase().includes(needle)) continue;
      snippets.push({
        id: relativePath,
        source: relativePath,
        content: firstKnowledgeLine(content),
        relevance: "high",
      });
    }
  }
  return snippets;
}

function assertSuggestionPath(
  location: KnowledgeLocation,
  suggestionPath: string,
): void {
  const base = resolve(knowledgeDir(location), "suggestions");
  const target = resolve(suggestionPath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`)) {
    throw new Error("Knowledge suggestion path must stay inside suggestions");
  }
}

function targetKnowledgeCategory(suggestion: KnowledgeSuggestion): string {
  if (suggestion.targetCategory) {
    if (!KNOWLEDGE_CATEGORIES.has(suggestion.targetCategory)) {
      throw new Error(`Knowledge target category is not allowed: ${suggestion.targetCategory}`);
    }
    return suggestion.targetCategory;
  }
  const defaults: Record<KnowledgeSuggestion["category"], string> = {
    "business-rule": "business-rules",
    "product-decision": "decisions",
    "surface-knowledge": "surfaces",
    pitfall: "pitfalls",
  };
  return defaults[suggestion.category];
}

function safeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "knowledge-record";
}

function renderKnowledgeRecord(suggestion: KnowledgeSuggestion): string {
  return [
    suggestion.content,
    "",
    `Source: ${suggestion.sourceArtifact}`,
    `Confidence: ${suggestion.confidence}`,
    `Reason: ${suggestion.reason}`,
    "",
  ].join("\n");
}

function archiveSuggestion(
  location: KnowledgeLocation,
  suggestionPath: string,
  decision: "accepted" | "rejected",
  record: Record<string, unknown>,
): string {
  const dir = join(knowledgeDir(location), "suggestions", decision);
  mkdirSync(dir, { recursive: true });
  const archivedPath = join(dir, basename(suggestionPath));
  writeFileSync(archivedPath, `${JSON.stringify(record, null, 2)}\n`);
  unlinkSync(suggestionPath);
  return archivedPath;
}

function updateKnowledgeIndex(
  location: KnowledgeLocation,
  record: Record<string, string>,
): void {
  const path = join(knowledgeDir(location), "index.json");
  const index = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as { records?: unknown[] })
    : {};
  const records = Array.isArray(index.records) ? index.records : [];
  writeFileSync(
    path,
    `${JSON.stringify({ records: [...records, record] }, null, 2)}\n`,
  );
}

function firstKnowledgeLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}
