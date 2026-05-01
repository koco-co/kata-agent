import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("mocked test-case-gen runtime loop", () => {
  test("runs from source through confirmation import to final artifacts", async () => {
    const fixture = JSON.parse(
      readFileSync(join(import.meta.dir, "fixtures", "poor-prd.json"), "utf8"),
    ) as { url: string };
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    const start = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "test-case-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--source-url",
        fixture.url,
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const started = JSON.parse(await new Response(start.stdout).text()) as {
      runId: string;
      status: string;
      currentNode: string;
    };
    const startError = await new Response(start.stderr).text();
    expect(await start.exited, startError).toBe(0);
    expect(started.status).toBe("waiting");
    expect(started.currentNode).toBe("await-confirmation-result");

    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    const confirmationPath = join(rootDir, "confirmation-result.json");
    await Bun.write(
      confirmationPath,
      JSON.stringify({
        schemaVersion: "0.1",
        answers: [
          { questionId: "GAP-001", status: "confirmed", answer: "保存" },
        ],
      }),
    );
    const imported = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "confirmation",
        "import",
        "--feature-dir",
        dir,
        "--run",
        started.runId,
        "--file",
        confirmationPath,
        "--project",
        "demo",
        "--feature",
        "rule-config",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    expect(await imported.exited).toBe(0);

    const resume = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "workflow",
        "resume",
        "--feature-dir",
        dir,
        "--run",
        started.runId,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const resumed = JSON.parse(await new Response(resume.stdout).text()) as {
      status: string;
    };
    const resumeError = await new Response(resume.stderr).text();
    expect(await resume.exited, resumeError).toBe(0);
    expect(resumed.status).toBe("succeeded");

    for (const path of [
      "requirement/spec/requirement-spec.json",
      "test-spec/test-spec.json",
      "test-spec/review-report.json",
      "exports/xmind/xmind-export.json",
      "exports/xmind/test-spec.xmind",
      "reports/design-report.md",
      `traces/${started.runId}.jsonl`,
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }
    expect(readFileSync(join(dir, "exports/xmind/test-spec.xmind"), "utf8")).toBe(
      "mock xmind export: 1 cases\n",
    );
  });
});
