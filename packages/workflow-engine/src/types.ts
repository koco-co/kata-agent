export type WorkflowNodeType = "tool" | "agent" | "gate" | "human" | "artifact";
export type WorkflowNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked"
  | "cancelled";
export type WorkflowStatus =
  | "created"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled";

export interface WorkflowNodeDefinition {
  id: string;
  type: WorkflowNodeType;
  action?: string;
  agent?: string;
  gate?: string;
  dependsOn?: string[];
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  skill: string;
  nodes: WorkflowNodeDefinition[];
}

export interface WorkflowRunState {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  currentNode?: string;
  nodes: Record<
    string,
    {
      status: WorkflowNodeStatus;
      error?: string;
      retryable?: boolean;
      waitingFor?: string;
    }
  >;
}

export interface TraceEvent {
  runId: string;
  nodeId: string;
  type:
    | "enter"
    | "exit"
    | "gate-passed"
    | "gate-failed"
    | "node-skipped"
    | "agent-call"
    | "provider-call"
    | "provider-cost-summary"
    | "plugin-action"
    | "artifact-write"
    | "knowledge-consult"
    | "knowledge-propose"
    | "human-import";
  actionId?: string;
  gateId?: string;
  artifactRefs?: string[];
  providerUsage?: {
    providerId: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    cost?: number;
  };
  message?: string;
  details?: Record<string, unknown>;
  at: string;
}
