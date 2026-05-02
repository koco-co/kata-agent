import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFeatureWorkspace,
  featureDir,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { RequirementSpec } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function requirementSpec(): RequirementSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置",
    status: "confirmed",
    rules: [
      {
        id: "REQ-001",
        text: "保存按钮文案为保存。",
        severity: "P0",
        sourceType: "confirmation",
        sourceRefs: ["SRC-001"],
        confirmationQuestionId: "GAP-001",
      },
    ],
    pageContracts: [],
    openItems: [],
    assumptions: [],
  };
}

describe("Lanhu writeback CLI", () => {
  test("creates unapproved writeback draft from RequirementSpec", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-lanhu-wb-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "RequirementSpec",
      "requirement/spec/requirement-spec.json",
      requirementSpec(),
      "test",
      { allowedScopes: ["feature.requirement.spec"] },
    );
    const dir = featureDir(location);
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "lanhu",
        "writeback-draft",
        "--feature-dir",
        dir,
        "--requirement-spec",
        "requirement/spec/requirement-spec.json",
        "--target-url",
        "https://lanhu.example/prd/123",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    const path = join(dir, "reports/lanhu-writeback-draft.json");
    expect(existsSync(path)).toBe(true);
    const draft = JSON.parse(readFileSync(path, "utf8")) as {
      confirmedForWriteback: boolean;
    };
    expect(draft.confirmedForWriteback).toBe(false);
  });

  test("writeback rejects unapproved non-dry-run draft", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-lanhu-wb-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "LanhuWritebackDraft",
      "reports/lanhu-writeback-draft.json",
      {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        sourceRequirementSpecRef: "RequirementSpec:abc",
        targetUrl: "https://lanhu.example/prd/123",
        summaryMarkdown: "change",
        changeRefs: ["REQ-001"],
        confirmedForWriteback: false,
      },
      "test",
      { allowedScopes: ["feature.reports"] },
    );
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "lanhu",
        "writeback",
        "--mode",
        "real",
        "--feature-dir",
        featureDir(location),
        "--draft",
        "reports/lanhu-writeback-draft.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain(
      "INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback",
    );
  });
});
