import { mkdtempSync, rmSync } from "node:fs";
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

describe("cli runtime", () => {
  test("starts test-case-gen and resumes after confirmation import", async () => {
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
        "mock://poor-prd",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const startOutput = await new Response(start.stdout).text();
    const startError = await new Response(start.stderr).text();
    expect(await start.exited, startError).toBe(0);
    const started = JSON.parse(startOutput) as {
      runId: string;
      status: string;
      currentNode: string;
    };
    expect(started.status).toBe("waiting");
    expect(started.currentNode).toBe("await-confirmation-result");

    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    await Bun.write(
      join(rootDir, "confirmation-result.json"),
      JSON.stringify({
        schemaVersion: "0.1",
        answers: [
          {
            questionId: "GAP-001",
            status: "confirmed",
            answer: "保存",
          },
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
        join(rootDir, "confirmation-result.json"),
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
    const resumeOutput = await new Response(resume.stdout).text();
    const resumeError = await new Response(resume.stderr).text();
    expect(await resume.exited, resumeError).toBe(0);
    const resumed = JSON.parse(resumeOutput) as { status: string };
    expect(resumed.status).toBe("succeeded");
  });
});
