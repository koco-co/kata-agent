import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFeatureWorkspace,
  featureDir,
  readArtifactVerified,
  writeArtifact,
} from "../packages/artifact-repo/src/index";
import {
  appendTrace,
  createRunState,
  markWaiting,
  saveWorkflowState,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("v0.1a foundation smoke", () => {
  test("persists a human-gated run with artifact and trace", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const dir = createFeatureWorkspace(location);
    const ref = writeArtifact(
      location,
      "ClarificationDossier",
      "requirement/clarifications/clarification-dossier.json",
      '{"schemaVersion":"0.1"}',
      "test",
    );
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    saveWorkflowState(
      dir,
      markWaiting(
        createRunState(definition, "run-1"),
        "await-confirmation-result",
        "ConfirmationResult",
      ),
    );
    appendTrace(dir, {
      runId: "run-1",
      nodeId: "await-confirmation-result",
      type: "enter",
      artifactRefs: [ref.id],
      at: new Date().toISOString(),
    });

    expect(readArtifactVerified(location, ref)).toBe('{"schemaVersion":"0.1"}');
    expect(
      readFileSync(join(featureDir(location), ".state", "run-1.json"), "utf8"),
    ).toContain('"waiting"');
    expect(
      readFileSync(join(featureDir(location), "traces", "run-1.jsonl"), "utf8"),
    ).toContain("await-confirmation-result");
  });
});
