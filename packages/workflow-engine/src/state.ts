import type {
  WorkflowDefinition,
  WorkflowNodeStatus,
  WorkflowRunState,
} from "./types";

export function createRunState(
  definition: WorkflowDefinition,
  runId: string,
): WorkflowRunState {
  return {
    workflowId: definition.id,
    runId,
    status: "created",
    nodes: Object.fromEntries(
      definition.nodes.map((node) => [node.id, { status: "pending" as const }]),
    ),
  };
}

function markNode(
  state: WorkflowRunState,
  nodeId: string,
  status: WorkflowNodeStatus,
  extra: Partial<WorkflowRunState["nodes"][string]> = {},
): WorkflowRunState {
  if (!state.nodes[nodeId]) throw new Error(`Unknown workflow node: ${nodeId}`);
  return {
    ...state,
    currentNode: nodeId,
    nodes: { ...state.nodes, [nodeId]: { status, ...extra } },
  };
}

export function markReady(
  state: WorkflowRunState,
  nodeId: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "ready"));
}

export function markRunning(
  state: WorkflowRunState,
  nodeId: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "running"));
}

export function markSucceeded(
  state: WorkflowRunState,
  nodeId: string,
  artifactRefs: string[] = [],
): WorkflowRunState {
  const extra = artifactRefs.length > 0 ? { artifactRefs } : {};
  return evaluateWorkflowStatus(markNode(state, nodeId, "succeeded", extra));
}

export function evaluateWorkflowStatus(
  state: WorkflowRunState,
): WorkflowRunState {
  const statuses = Object.values(state.nodes).map((node) => node.status);
  if (statuses.some((status) => status === "failed")) {
    return { ...state, status: "failed" };
  }
  if (statuses.some((status) => status === "blocked")) {
    return { ...state, status: "blocked" };
  }
  if (statuses.some((status) => status === "cancelled")) {
    return { ...state, status: "cancelled" };
  }
  if (statuses.some((status) => status === "waiting")) {
    return { ...state, status: "waiting" };
  }
  const terminal = new Set(["succeeded", "skipped"]);
  const allFinished =
    statuses.length > 0 && statuses.every((status) => terminal.has(status));
  return {
    ...state,
    status: allFinished ? "succeeded" : "running",
  };
}

export function markFailed(
  state: WorkflowRunState,
  nodeId: string,
  error: string,
  retryable = false,
): WorkflowRunState {
  return evaluateWorkflowStatus(
    markNode(state, nodeId, "failed", { error, retryable }),
  );
}

export function markBlocked(
  state: WorkflowRunState,
  nodeId: string,
  error: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "blocked", { error }));
}

export function markWaiting(
  state: WorkflowRunState,
  nodeId: string,
  waitingFor: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(
    markNode(state, nodeId, "waiting", { waitingFor }),
  );
}

export function markPendingCascade(
  state: WorkflowRunState,
  definition: WorkflowDefinition,
  startNodeId: string,
): WorkflowRunState {
  if (!state.nodes[startNodeId]) {
    throw new Error(`Unknown workflow node: ${startNodeId}`);
  }
  const pending = downstreamNodeIds(definition, startNodeId);
  const nodes = { ...state.nodes };
  for (const nodeId of pending) {
    nodes[nodeId] = { status: "pending" };
  }
  return evaluateWorkflowStatus({
    ...state,
    currentNode: startNodeId,
    nodes,
  });
}

export function findArtifactWriterNode(
  state: WorkflowRunState,
  artifactRefId: string,
): string | undefined {
  return Object.entries(state.nodes).find(([, node]) =>
    node.artifactRefs?.includes(artifactRefId),
  )?.[0];
}

function downstreamNodeIds(
  definition: WorkflowDefinition,
  startNodeId: string,
): Set<string> {
  const result = new Set<string>([startNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of definition.nodes) {
      if (result.has(node.id)) continue;
      if ((node.dependsOn ?? []).some((dependency) => result.has(dependency))) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}
