#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { writeArtifactInFeatureDir } from "../../../packages/artifact-repo/src/index";
import { SCHEMA_VERSION } from "../../../packages/core/src/index";
import {
  appendTrace,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
} from "../../../packages/workflow-engine/src/index";

const [, , group, subcommand, ...args] = Bun.argv;
const command =
  group === "workflow" || group === "confirmation"
    ? `${group} ${subcommand ?? ""}`.trim()
    : group;

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireArg(name: string): string {
  const value = argValue(name);
  if (!value) {
    console.error(`Missing required argument: ${name}`);
    process.exit(1);
  }
  return value;
}

if (!command || command === "help") {
  console.log(
    "kata-agent commands: workflow status, workflow resume, confirmation import",
  );
  process.exit(0);
}

if (command === "test-case-gen") {
  console.error("test-case-gen start is implemented in v0.1b");
  process.exit(1);
}

if (command === "workflow status") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const state = loadWorkflowState(featureDir, runId);
  console.log(
    JSON.stringify(
      { runId, status: state.status, currentNode: state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow resume") {
  console.error("workflow resume is implemented in v0.1b");
  process.exit(1);
}

if (command === "confirmation import") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const file = requireArg("--file");
  const rawConfirmation = readFileSync(file, "utf8");
  const confirmation = JSON.parse(rawConfirmation) as {
    schemaVersion?: unknown;
    answers?: unknown;
  };
  if (
    // v0.1b: validate ConfirmationResult with Ajv instead of shape checks.
    confirmation.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(confirmation.answers)
  ) {
    console.error(
      "Invalid ConfirmationResult: expected schemaVersion 0.1 and answers[]",
    );
    process.exit(1);
  }
  const state = loadWorkflowState(featureDir, runId);
  const waitingNode =
    state.currentNode && state.nodes[state.currentNode]?.status === "waiting"
      ? state.currentNode
      : Object.entries(state.nodes).find(
          ([, node]) =>
            node.status === "waiting" &&
            node.waitingFor === "ConfirmationResult",
        )?.[0];
  if (!waitingNode) {
    console.error(
      `No workflow node is waiting for ConfirmationResult in run ${runId}`,
    );
    process.exit(1);
  }
  const project = argValue("--project");
  const feature = argValue("--feature");
  const ref = writeArtifactInFeatureDir(
    featureDir,
    "ConfirmationResult",
    "requirement/confirmed/confirmation-result.json",
    rawConfirmation,
    "confirmation import",
    {
      allowedScopes: ["feature.requirement.confirmed"],
      project,
      feature,
    },
  );
  saveWorkflowState(featureDir, markSucceeded(state, waitingNode));
  appendTrace(featureDir, {
    runId,
    nodeId: waitingNode,
    type: "human-import",
    artifactRefs: [ref.id],
    at: new Date().toISOString(),
  });
  console.log(`confirmation imported for ${runId}:${waitingNode}`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
