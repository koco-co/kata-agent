import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  featureDir,
  readArtifactIndex,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type {
  IssueDraft,
  SourceRepoRef,
  TestSpec,
} from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function seedHotfixInputs(location: {
  rootDir: string;
  project: string;
  feature: string;
}) {
  const issue: IssueDraft = {
    schemaVersion: "0.1",
    project: location.project,
    feature: location.feature,
    sourceBugReportRef: "BugReport:abc",
    sourceBugId: "BUG-001",
    title: "保存按钮点击无响应",
    severity: "P1",
    descriptionMarkdown: "点击保存后页面没有反馈，配置未提交。",
    reproductionSteps: ["打开规则配置页", "修改规则名称", "点击保存按钮"],
    evidenceRefs: ["EvidencePack:abc"],
    labels: ["hotfix", "regression"],
    confirmedForSync: true,
  };
  const issueRef = writeJsonArtifact(
    location,
    "IssueDraft",
    "reports/issues/BUG-001.issue-draft.json",
    issue,
    "test",
    { allowedScopes: ["feature.reports"] },
  );
  const source: SourceRepoRef = {
    schemaVersion: "0.1",
    repoId: "frontend",
    sourceRoot: "source-repos/frontend",
    branch: "main",
    commit: "abc123",
    readOnly: true,
  };
  const sourceRef = writeJsonArtifact(
    location,
    "SourceRepoRef",
    "reports/static-scan/source-repo-ref.json",
    source,
    "test",
    { allowedScopes: ["feature.reports"] },
  );
  return { issueRef, sourceRef };
}

function spawnHotfixCaseGen(location: {
  rootDir: string;
  project: string;
  feature: string;
}) {
  return Bun.spawn(
    [
      "bun",
      "apps/cli/src/index.ts",
      "hotfix-case-gen",
      "--feature-dir",
      featureDir(location),
      "--issue-draft",
      "reports/issues/BUG-001.issue-draft.json",
      "--source-repo",
      "reports/static-scan/source-repo-ref.json",
    ],
    { cwd: repoRoot, stderr: "pipe" },
  );
}

describe("hotfix-case-gen CLI", () => {
  test("writes hotfix TestSpec JSON and Markdown from issue and source refs", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-hotfix-case-gen-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const { issueRef } = seedHotfixInputs(location);

    const proc = spawnHotfixCaseGen(location);

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output)).toEqual({
      testSpecPath: "test-spec/hotfix-test-spec.json",
      testSpecMarkdownPath: "test-spec/hotfix-test-spec.md",
    });

    const dir = featureDir(location);
    expect(existsSync(join(dir, "test-spec/hotfix-test-spec.json"))).toBe(true);
    expect(existsSync(join(dir, "test-spec/hotfix-test-spec.md"))).toBe(true);

    const spec = JSON.parse(
      readFileSync(join(dir, "test-spec/hotfix-test-spec.json"), "utf8"),
    ) as TestSpec;
    const testCase = spec.modules[0].cases[0];
    expect(testCase.title).toContain("保存按钮点击无响应");
    expect(testCase.priority).toBe("P1");
    expect(testCase.automation.readiness).toBe("blocked");
    expect(testCase.requirementRefs).toEqual([issueRef.id]);
    expect(testCase.assertions[0].target).toBe("frontend");

    expect(
      readFileSync(join(dir, "test-spec/hotfix-test-spec.md"), "utf8"),
    ).toContain("保存按钮点击无响应");

    const index = readArtifactIndex(location);
    expect(
      index.artifacts.map((artifact) => [artifact.type, artifact.path]).sort(),
    ).toEqual(
      [
        ["HotfixCaseGenInput", "reports/hotfix-case-gen-input.json"],
        ["IssueDraft", "reports/issues/BUG-001.issue-draft.json"],
        ["SourceRepoRef", "reports/static-scan/source-repo-ref.json"],
        ["TestSpec", "test-spec/hotfix-test-spec.json"],
        ["TestSpecMarkdown", "test-spec/hotfix-test-spec.md"],
      ].sort(),
    );
  });

  test("preserves P2 issue severity as P2 hotfix priority", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-hotfix-case-gen-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    seedHotfixInputs(location);
    const issuePath = join(
      featureDir(location),
      "reports/issues/BUG-001.issue-draft.json",
    );
    const issue = JSON.parse(readFileSync(issuePath, "utf8")) as IssueDraft;
    issue.severity = "P2";
    writeJsonArtifact(
      location,
      "IssueDraft",
      "reports/issues/BUG-001.issue-draft.json",
      issue,
      "test",
      { allowedScopes: ["feature.reports"] },
    );

    const proc = spawnHotfixCaseGen(location);
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);

    const spec = JSON.parse(
      readFileSync(
        join(featureDir(location), "test-spec/hotfix-test-spec.json"),
        "utf8",
      ),
    ) as TestSpec;
    expect(spec.modules[0].cases[0].priority).toBe("P2");
  });
});
