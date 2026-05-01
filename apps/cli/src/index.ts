#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { writeArtifactInFeatureDir } from "../../../packages/artifact-repo/src/index";
import {
  assertValidSchema,
  type ConfirmationResult,
} from "../../../packages/domain/src/index";
import { listSuggestions } from "../../../packages/knowledge-repo/src/index";
import {
  appendTrace,
  createRuntimeServices,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
  type RuntimeFactoryOptions,
  type WorkflowDefinition,
} from "../../../packages/workflow-engine/src/index";

const rawArgs = Bun.argv.slice(2);
const [group, subcommand] = rawArgs;
const command =
  group === "workflow" || group === "confirmation" || group === "knowledge"
    ? `${group} ${subcommand ?? ""}`.trim()
    : group;
const args =
  group === "workflow" || group === "confirmation" || group === "knowledge"
    ? rawArgs.slice(2)
    : rawArgs.slice(1);

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

function runtimeMode(): RuntimeFactoryOptions["mode"] {
  const mode = argValue("--mode") ?? "mock";
  if (mode !== "mock" && mode !== "real") {
    console.error(`Invalid --mode: ${mode}. Expected "mock" or "real".`);
    process.exit(1);
  }
  return mode;
}

function loadWorkflowDefinition(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(process.cwd(), "workflows", "test-case-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

function parseFeatureDir(featureDir: string): {
  rootDir: string;
  project: string;
  feature: string;
} {
  const resolved = resolve(featureDir);
  return {
    rootDir: dirname(dirname(dirname(dirname(resolved)))),
    project: basename(dirname(dirname(resolved))),
    feature: basename(resolved),
  };
}

if (!command || command === "help") {
  console.log(
    "kata-agent commands: test-case-gen, workflow status, workflow resume, confirmation import, knowledge suggestions",
  );
  process.exit(0);
}

if (command === "knowledge suggestions") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  console.log(JSON.stringify(listSuggestions({ rootDir, project }), null, 2));
  process.exit(0);
}

if (command === "test-case-gen") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const sourceUrl = requireArg("--source-url");
  const runId = argValue("--run") ?? randomUUID();
  const { executor } = createRuntimeServices({ rootDir, mode: runtimeMode() });
  const result = await executor.start({
    location: { rootDir, project, feature },
    definition: loadWorkflowDefinition(),
    runId,
    sourceUrl,
  });
  console.log(
    JSON.stringify(
      { runId, status: result.state.status, currentNode: result.state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow status") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const state = loadWorkflowState(featureDir, runId);
  console.log(
    JSON.stringify(
      {
        runId,
        status: state.status,
        currentNode: state.currentNode,
        nodes: state.nodes,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow resume") {
  const targetFeatureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const location = parseFeatureDir(targetFeatureDir);
  const { executor } = createRuntimeServices({
    rootDir: location.rootDir,
    mode: runtimeMode(),
  });
  const result = await executor.resume({
    location,
    definition: loadWorkflowDefinition(),
    runId,
  });
  console.log(
    JSON.stringify(
      { runId, status: result.state.status, currentNode: result.state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "confirmation import") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const file = requireArg("--file");
  let confirmation: ConfirmationResult;
  try {
    confirmation = JSON.parse(readFileSync(file, "utf8")) as ConfirmationResult;
    assertValidSchema("ConfirmationResult", confirmation);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const canonicalConfirmation = `${JSON.stringify(confirmation, null, 2)}\n`;
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
    canonicalConfirmation,
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
