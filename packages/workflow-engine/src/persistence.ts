import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkflowRunState } from "./types";

export function workflowStatePath(featureDir: string, runId: string): string {
  return join(featureDir, ".state", `${runId}.json`);
}

export function saveWorkflowState(
  featureDir: string,
  state: WorkflowRunState,
): string {
  const path = workflowStatePath(featureDir, state.runId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
  return path;
}

export function loadWorkflowState(
  featureDir: string,
  runId: string,
): WorkflowRunState {
  return JSON.parse(
    readFileSync(workflowStatePath(featureDir, runId), "utf8"),
  ) as WorkflowRunState;
}
