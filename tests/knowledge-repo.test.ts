import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  readSuggestion,
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
});
