import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { KnowledgeSuggestion } from "../../domain/src/index";

export interface KnowledgeLocation {
  rootDir: string;
  project: string;
}

export function knowledgeDir(location: KnowledgeLocation): string {
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
