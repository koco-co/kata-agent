import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { writeSuggestion } from "../packages/knowledge-repo/src/index";
import type { KnowledgeSuggestion } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("knowledge keeper CLI", () => {
  test("lists suggestion paths as JSON", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/spec/requirement-spec.json",
      content: "保存按钮文案为保存。",
      reason: "confirmed requirement rule",
    };
    const path = writeSuggestion({ rootDir, project: "demo" }, suggestion);

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "knowledge",
        "suggestions",
        "--root",
        rootDir,
        "--project",
        "demo",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output)).toEqual([path]);
  });

  test("accepts a suggestion and searches accepted knowledge", async () => {
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
    const path = writeSuggestion({ rootDir, project: "demo" }, suggestion);

    const accept = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "knowledge",
        "accept",
        "--root",
        rootDir,
        "--project",
        "demo",
        "--suggestion",
        path,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const acceptOutput = await new Response(accept.stdout).text();
    const acceptError = await new Response(accept.stderr).text();
    expect(await accept.exited, acceptError).toBe(0);
    const accepted = JSON.parse(acceptOutput) as { targetPath: string };
    expect(existsSync(accepted.targetPath)).toBe(true);

    const search = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "knowledge",
        "search",
        "--root",
        rootDir,
        "--project",
        "demo",
        "--query",
        "保存",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const searchOutput = await new Response(search.stdout).text();
    const searchError = await new Response(search.stderr).text();
    expect(await search.exited, searchError).toBe(0);
    expect(JSON.parse(searchOutput)).toEqual([
      {
        id: "decisions/save-button-copy.md",
        source: "decisions/save-button-copy.md",
        content: "保存按钮文案为保存。",
        relevance: "high",
      },
    ]);
  });
});
