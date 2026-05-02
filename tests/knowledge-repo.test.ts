import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  acceptSuggestion,
  readSuggestion,
  rejectSuggestion,
  searchKnowledge,
  writeSuggestion,
} from "../packages/knowledge-repo/src/index";
import type { KnowledgeSuggestion } from "../packages/domain/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("knowledge repository", () => {
  test("writes and reads knowledge suggestions", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/confirmed/confirmation-result.json",
      content: "列表默认按创建时间倒序。",
      reason: "产品确认",
    };
    const path = writeSuggestion({ rootDir, project: "demo" }, suggestion);
    expect(readSuggestion(path).content).toContain("创建时间倒序");
  });

  test("accepts suggestions into canonical knowledge and searches them", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/spec/requirement-spec.json",
      content: "保存按钮文案为保存。",
      targetCategory: "decisions",
      targetSlug: "save-button-copy",
      reason: "confirmed requirement rule",
    };
    const suggestionPath = writeSuggestion({ rootDir, project: "demo" }, suggestion);

    const result = acceptSuggestion({ rootDir, project: "demo" }, suggestionPath);

    expect(result.targetPath.endsWith("decisions/save-button-copy.md")).toBe(true);
    expect(readFileSync(result.targetPath, "utf8")).toContain(
      "保存按钮文案为保存。",
    );
    expect(existsSync(result.archivedPath)).toBe(true);
    expect(searchKnowledge({ rootDir, project: "demo" }, "保存")).toEqual([
      {
        id: "decisions/save-button-copy.md",
        source: "decisions/save-button-copy.md",
        content: "保存按钮文案为保存。",
        relevance: "high",
      },
    ]);
  });

  test("rejects accepted suggestion target categories that escape knowledge root", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestionPath = writeSuggestion(
      { rootDir, project: "demo" },
      {
        schemaVersion: "0.1",
        category: "product-decision",
        confidence: "high",
        sourceArtifact: "requirement/spec/requirement-spec.json",
        content: "恶意路径不应写出知识库。",
        targetCategory: "../../outside",
        targetSlug: "escape",
        reason: "malformed suggestion",
      } as unknown as KnowledgeSuggestion,
    );

    expect(() =>
      acceptSuggestion({ rootDir, project: "demo" }, suggestionPath),
    ).toThrow("Knowledge target category");
  });

  test("rejects suggestions into an audit archive", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "pitfall",
      confidence: "medium",
      sourceArtifact: "reports/design-report.json",
      content: "暂不采纳的经验。",
      reason: "too broad",
    };
    const suggestionPath = writeSuggestion({ rootDir, project: "demo" }, suggestion);

    const result = rejectSuggestion(
      { rootDir, project: "demo" },
      suggestionPath,
      "duplicate",
    );

    expect(existsSync(result.archivedPath)).toBe(true);
    expect(readFileSync(result.archivedPath, "utf8")).toContain(
      '"rejectionReason": "duplicate"',
    );
  });

  test("rejects project path escape segments", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/confirmed/confirmation-result.json",
      content: "列表默认按创建时间倒序。",
      reason: "产品确认",
    };

    expect(() =>
      writeSuggestion({ rootDir, project: "../outside" }, suggestion),
    ).toThrow("Knowledge location project");
  });
});
