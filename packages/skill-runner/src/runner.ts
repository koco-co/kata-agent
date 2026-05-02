import { randomUUID } from "node:crypto";
import {
  assertValidSchema,
  SCHEMA_REGISTRY,
  type SchemaName,
} from "../../domain/src/index";
import type { WorkflowDefinition, WorkflowStatus } from "../../workflow-engine/src/index";
import type { SkillManifest } from "./types";

export interface RunHandle {
  runId: string;
  workflowId: string;
  status: WorkflowStatus;
  currentNode?: string;
}

export interface SkillRunnerStartOptions {
  runId?: string;
}

export interface SkillRunnerDependencies {
  loadWorkflow: (workflowId: string) => Promise<WorkflowDefinition> | WorkflowDefinition;
  startWorkflow: (
    workflow: WorkflowDefinition,
    runId: string,
    input: unknown,
  ) => Promise<{ status: WorkflowStatus; currentNode?: string }> | {
    status: WorkflowStatus;
    currentNode?: string;
  };
  generateRunId?: () => string;
}

export class SkillRunner {
  constructor(private readonly deps?: SkillRunnerDependencies) {}

  async start(
    skill: SkillManifest,
    input: unknown,
    options: SkillRunnerStartOptions = {},
  ): Promise<RunHandle> {
    if (!this.deps) {
      throw new Error("SkillRunner requires workflow dependencies");
    }
    if (skill.status === "planned") {
      throw new Error(`Skill is planned and cannot start: ${skill.name}`);
    }
    const inputSchema = skill.inputs?.schema;
    if (inputSchema) {
      if (!isSchemaName(inputSchema)) {
        throw new Error(`SCHEMA_REFERENCE_NOT_FOUND ${inputSchema}`);
      }
      assertValidSchema(inputSchema, input);
    }
    const workflow = await this.deps.loadWorkflow(skill.workflow);
    if (skill.status === "interface-only" && !workflow) {
      throw new Error(`Skill workflow is not implemented: ${skill.name}`);
    }
    if (workflow.skill !== skill.name || workflow.id !== skill.workflow) {
      throw new Error(
        `INVALID_WORKFLOW_DEFINITION ${skill.name} -> ${workflow.id}`,
      );
    }
    const runId =
      options.runId ?? this.deps.generateRunId?.() ?? randomUUID();
    const result = await this.deps.startWorkflow(workflow, runId, input);
    return {
      runId,
      workflowId: workflow.id,
      status: result.status,
      currentNode: result.currentNode,
    };
  }
}

function isSchemaName(value: string): value is SchemaName {
  return Object.prototype.hasOwnProperty.call(SCHEMA_REGISTRY, value);
}
