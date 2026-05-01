import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createRunState,
  markWaiting,
  saveWorkflowState,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("cli", () => {
  test("prints help", async () => {
    const proc = Bun.spawn(["bun", "apps/cli/src/index.ts", "help"], {
      cwd: repoRoot,
    });
    const output = await new Response(proc.stdout).text();
    expect(output).toContain("kata-agent commands");
  });

  test("workflow resume requires a feature directory", async () => {
    const proc = Bun.spawn(
      ["bun", "apps/cli/src/index.ts", "workflow", "resume", "--run", "run-1"],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(error).toContain("Missing required argument: --feature-dir");
  });

  test("imports confirmation and marks waiting node succeeded", async () => {
    const featureDir = mkdtempSync(join(tmpdir(), "kata-agent-feature-"));
    roots.push(featureDir);
    mkdirSync(join(featureDir, ".state"), { recursive: true });
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    saveWorkflowState(
      featureDir,
      markWaiting(
        createRunState(definition, "run-1"),
        "await-confirmation-result",
        "ConfirmationResult",
      ),
    );
    const confirmationPath = join(featureDir, "confirmation-result.json");
    writeFileSync(
      confirmationPath,
      JSON.stringify({ schemaVersion: "0.1", answers: [] }),
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "confirmation",
        "import",
        "--feature-dir",
        featureDir,
        "--run",
        "run-1",
        "--file",
        confirmationPath,
        "--project",
        "demo",
        "--feature",
        "rule-config",
      ],
      { cwd: repoRoot },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    const saved = JSON.parse(
      readFileSync(join(featureDir, ".state", "run-1.json"), "utf8"),
    );

    expect(exitCode).toBe(0);
    expect(output).toContain("confirmation imported");
    expect(saved.nodes["await-confirmation-result"].status).toBe("succeeded");
    expect(
      readFileSync(
        join(featureDir, "requirement", "confirmed", "confirmation-result.json"),
        "utf8",
      ),
    ).toContain('"answers":[]');
    expect(
      readFileSync(join(featureDir, "traces", "run-1.jsonl"), "utf8"),
    ).toContain('"type":"human-import"');
    const index = JSON.parse(
      readFileSync(join(featureDir, "artifact-index.json"), "utf8"),
    );
    expect(index.project).toBe("demo");
    expect(index.feature).toBe("rule-config");
  });
});
