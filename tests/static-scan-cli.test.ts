import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir, readArtifactIndex } from "../packages/artifact-repo/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("static-scan CLI", () => {
  test("writes source ref, input, and inspection report artifacts", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const diffPath = join(rootDir, "diff.patch");
    writeFileSync(
      diffPath,
      "diff --git a/src/app.ts b/src/app.ts\n+++ b/src/app.ts\n+console.log('debug')\n",
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "static-scan",
        "--root",
        rootDir,
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--repo-id",
        "frontend",
        "--source-root",
        "source-repos/frontend",
        "--diff-file",
        diffPath,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output).inspectionReportPath).toBe(
      "reports/static-scan/inspection-report.json",
    );
    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    expect(
      existsSync(join(dir, "reports/static-scan/source-repo-ref.json")),
    ).toBe(true);
    expect(
      existsSync(join(dir, "reports/static-scan/static-scan-input.json")),
    ).toBe(true);
    const index = readArtifactIndex({
      rootDir,
      project: "demo",
      feature: "rule-config",
    });
    expect(
      index.artifacts.some(
        (artifact) =>
          artifact.type === "StaticScanInput" &&
          artifact.path === "reports/static-scan/static-scan-input.json",
      ),
    ).toBe(true);
    expect(
      readFileSync(join(dir, "reports/static-scan/inspection-report.json"), "utf8"),
    ).toContain("debug-code");
  });

  test("rejects source roots that escape the workspace", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const diffPath = join(rootDir, "diff.patch");
    writeFileSync(diffPath, "+console.log('debug')\n");

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "static-scan",
        "--root",
        rootDir,
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--repo-id",
        "frontend",
        "--source-root",
        "../frontend",
        "--diff-file",
        diffPath,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );

    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("SourceRepoRef");
  });
});
