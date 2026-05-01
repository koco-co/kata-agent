import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TraceEvent } from "./types";

export function workflowTracePath(featureDir: string, runId: string): string {
  return join(featureDir, "traces", `${runId}.jsonl`);
}

export function appendTrace(featureDir: string, event: TraceEvent): string {
  const path = workflowTracePath(featureDir, event.runId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  return path;
}
