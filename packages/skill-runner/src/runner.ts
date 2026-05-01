import type { SkillManifest } from "./types";

export interface RunHandle {
  runId: string;
  workflowId: string;
  status: "created";
}

export class SkillRunner {
  async start(_skill: SkillManifest, _input: unknown): Promise<RunHandle> {
    throw new Error("SkillRunner.start is implemented in v0.1b");
  }
}
