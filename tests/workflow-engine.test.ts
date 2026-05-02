import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  appendTrace,
  createRunState,
  loadWorkflowState,
  markBlocked,
  markFailed,
  markRunning,
  markPendingCascade,
  markSucceeded,
  markWaiting,
  saveWorkflowState,
  workflowTracePath,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workflow persistence", () => {
  test("persists waiting human confirmation state", () => {
    const root = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(root);
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    const state = markWaiting(
      createRunState(definition, "run-1"),
      "await-confirmation-result",
      "ConfirmationResult",
    );
    saveWorkflowState(root, state);
    const loaded = loadWorkflowState(root, "run-1");
    expect(loaded.status).toBe("waiting");
    expect(loaded.nodes["await-confirmation-result"]?.waitingFor).toBe(
      "ConfirmationResult",
    );
  });

  test("supports normal node transitions", () => {
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "ingest-requirement-source", type: "tool" }],
    };
    const running = markRunning(
      createRunState(definition, "run-2"),
      "ingest-requirement-source",
    );
    const succeeded = markSucceeded(running, "ingest-requirement-source");
    const failed = markFailed(
      running,
      "ingest-requirement-source",
      "network error",
    );
    expect(succeeded.nodes["ingest-requirement-source"]?.status).toBe(
      "succeeded",
    );
    expect(succeeded.status).toBe("succeeded");
    expect(failed.nodes["ingest-requirement-source"]?.error).toBe(
      "network error",
    );
  });

  test("re-evaluates workflow status across multiple nodes", () => {
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [
        { id: "await-confirmation-result", type: "human" },
        { id: "author-requirement-spec", type: "agent" },
      ],
    };
    const waiting = markWaiting(
      createRunState(definition, "run-3"),
      "await-confirmation-result",
      "ConfirmationResult",
    );
    const resumed = markSucceeded(waiting, "await-confirmation-result");
    const blocked = markBlocked(
      resumed,
      "author-requirement-spec",
      "unconfirmed P0",
    );
    expect(resumed.status).toBe("running");
    expect(blocked.status).toBe("blocked");
  });

  test("resets a succeeded node and downstream dependents to pending", () => {
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [
        { id: "source", type: "tool" },
        { id: "normalize", type: "agent", dependsOn: ["source"] },
        { id: "report", type: "artifact", dependsOn: ["normalize"] },
      ],
    };
    let state = createRunState(definition, "run-cascade");
    state = markSucceeded(state, "source", ["RequirementSourceBundle:1"]);
    state = markSucceeded(state, "normalize", ["RequirementDraft:1"]);
    state = markSucceeded(state, "report", ["DesignReport:1"]);

    const reset = markPendingCascade(state, definition, "normalize");

    expect(reset.status).toBe("running");
    expect(reset.nodes.source).toEqual({
      status: "succeeded",
      artifactRefs: ["RequirementSourceBundle:1"],
    });
    expect(reset.nodes.normalize).toEqual({ status: "pending" });
    expect(reset.nodes.report).toEqual({ status: "pending" });
  });

  test("appends trace events for a run", () => {
    const root = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(root);
    appendTrace(root, {
      runId: "run-4",
      nodeId: "ingest-requirement-source",
      type: "enter",
      at: new Date().toISOString(),
    });
    const trace = readFileSync(workflowTracePath(root, "run-4"), "utf8");
    expect(trace).toContain('"nodeId":"ingest-requirement-source"');
  });
});
