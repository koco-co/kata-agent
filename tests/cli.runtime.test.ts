import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  test("confirmation import blocks rejected P0 answers with rebuttal report", async () => {
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
    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    const rejectedPath = join(rootDir, "confirmation-result-rejected.json");
    await Bun.write(
      rejectedPath,
      JSON.stringify({
        schemaVersion: "0.1",
        answers: [
          {
            questionId: "GAP-001",
            status: "rejected",
            answer: "该问题不能按默认值处理",
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
      rejectedPath,
      "--project",
      "demo",
      "--feature",
      "rule-config",
    ]);
    expect(imported.exitCode, imported.error).toBe(0);

    const status = await runCli([
      "workflow",
      "status",
      "--feature-dir",
      dir,
      "--run",
      started.runId,
    ]);
    expect(status.exitCode, status.error).toBe(0);
    const state = JSON.parse(status.output) as {
      status: string;
      currentNode: string;
      nodes: Record<string, { status: string; error?: string }>;
    };

    expect(state.status).toBe("blocked");
    expect(state.currentNode).toBe("await-confirmation-result");
    expect(state.nodes["await-confirmation-result"]).toEqual({
      status: "blocked",
      error: "rejected P0 confirmation answers",
    });
    const rebuttalPath = join(dir, "reports", "clarification-rebuttal.md");
    expect(existsSync(rebuttalPath)).toBe(true);
    expect(readFileSync(rebuttalPath, "utf8")).toContain(
      "GAP-001: 保存按钮文案是什么?",
    );
  });
});
