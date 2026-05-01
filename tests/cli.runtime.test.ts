import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

async function runCli(args: string[]): Promise<{
  output: string;
  error: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["bun", "apps/cli/src/index.ts", ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { output, error, exitCode };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("cli runtime", () => {
  test("starts test-case-gen and resumes after confirmation import", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    const start = await runCli([
        "test-case-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--source-url",
        "mock://poor-prd",
        "--root",
        rootDir,
    ]);
    expect(start.exitCode, start.error).toBe(0);
    const started = JSON.parse(start.output) as {
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
    const imported = await runCli([
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
    ]);
    expect(imported.exitCode, imported.error).toBe(0);

    const resume = await runCli([
        "workflow",
        "resume",
        "--feature-dir",
        dir,
        "--run",
        started.runId,
    ]);
    expect(resume.exitCode, resume.error).toBe(0);
    const resumed = JSON.parse(resume.output) as { status: string };
    expect(resumed.status).toBe("succeeded");
  });
});
