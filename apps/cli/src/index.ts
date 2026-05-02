#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import {
  readArtifactIndex,
  readJsonArtifact,
  writeArtifactInFeatureDir,
  writeJsonArtifact,
} from "../../../packages/artifact-repo/src/index";
import { LocalConfigLoader } from "../../../packages/core/src/index";
import {
  assertValidSchema,
  type BugReport,
  type ConfirmationResult,
  type IssueDraft,
  type PlaywrightRealOptions,
  type UiScriptGenInput,
} from "../../../packages/domain/src/index";
import { listSuggestions } from "../../../packages/knowledge-repo/src/index";
import {
  appendTrace,
  buildIssueDraftsFromBugReport,
  createRuntimeServices,
  issueDraftPath,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
  type RuntimeFactoryOptions,
  type WorkflowDefinition,
} from "../../../packages/workflow-engine/src/index";
import { mockSyncIssueToZentao } from "../../../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../../../plugins/zentao/src/real";

const rawArgs = Bun.argv.slice(2);
const [group, subcommand] = rawArgs;
const command =
  group === "workflow" ||
  group === "confirmation" ||
  group === "knowledge" ||
  group === "issue" ||
  group === "lanhu"
    ? `${group} ${subcommand ?? ""}`.trim()
    : group;
const args =
  group === "workflow" ||
  group === "confirmation" ||
  group === "knowledge" ||
  group === "issue" ||
  group === "lanhu"
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

function booleanFlag(name: string): boolean {
  return args.includes(name);
}

function runtimeMode(): RuntimeFactoryOptions["mode"] {
  const mode = argValue("--mode") ?? "mock";
  if (mode !== "mock" && mode !== "real") {
    console.error(`Invalid --mode: ${mode}. Expected "mock" or "real".`);
    process.exit(1);
  }
  return mode;
}

function notifyMode(): RuntimeFactoryOptions["notifyMode"] {
  const value = argValue("--notify") ?? "mock";
  if (value !== "mock" && value !== "real" && value !== "off") {
    console.error(
      `Invalid --notify: ${value}. Expected "mock", "real", or "off".`,
    );
    process.exit(1);
  }
  return value;
}

function browserType(): PlaywrightRealOptions["browserType"] {
  const browser = argValue("--browser") ?? "chromium";
  if (browser !== "chromium" && browser !== "firefox" && browser !== "webkit") {
    console.error(
      `Invalid --browser: ${browser}. Expected "chromium", "firefox", or "webkit".`,
    );
    process.exit(1);
  }
  return browser;
}

function loadWorkflowDefinition(name = "test-case-gen"): WorkflowDefinition {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid workflow name: ${name}`);
  }
  return YAML.parse(
    readFileSync(join(process.cwd(), "workflows", `${name}.yaml`), "utf8"),
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
    "kata-agent commands: test-case-gen, ui-script-gen, workflow status, workflow resume, confirmation import, knowledge suggestions",
  );
  process.exit(0);
}

if (command === "knowledge suggestions") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  console.log(JSON.stringify(listSuggestions({ rootDir, project }), null, 2));
  process.exit(0);
}

if (command === "issue draft") {
  const targetFeatureDir = requireArg("--feature-dir");
  const bugReportPath = requireArg("--bug-report");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const bugReportRef = index.artifacts.find(
    (item) => item.type === "BugReport" && item.path === bugReportPath,
  );
  if (!bugReportRef) {
    console.error(`Missing BugReport artifact: ${bugReportPath}`);
    process.exit(1);
  }
  const bugReport = readJsonArtifact<BugReport>(
    location,
    bugReportRef,
    "BugReport",
  );
  const drafts = buildIssueDraftsFromBugReport(bugReportRef, bugReport);
  const paths: string[] = [];
  for (const draft of drafts) {
    const path = issueDraftPath(draft);
    writeJsonArtifact(location, "IssueDraft", path, draft, "issue draft", {
      allowedScopes: ["feature.reports"],
    });
    paths.push(path);
  }
  console.log(JSON.stringify({ count: paths.length, paths }, null, 2));
  process.exit(0);
}

if (command === "issue sync") {
  const targetFeatureDir = requireArg("--feature-dir");
  const draftPath = requireArg("--issue-draft");
  const dryRun = booleanFlag("--dry-run");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const draftRef = index.artifacts.find(
    (item) => item.type === "IssueDraft" && item.path === draftPath,
  );
  if (!draftRef) {
    console.error(`Missing IssueDraft artifact: ${draftPath}`);
    process.exit(1);
  }
  const draft = {
    ...readJsonArtifact<IssueDraft>(location, draftRef, "IssueDraft"),
    sourceIssueDraftRef: draftRef.id,
  };
  try {
    const config = new LocalConfigLoader({ rootDir: location.rootDir });
    const result =
      runtimeMode() === "real"
        ? await syncIssueToZentao(draft, {
            baseUrl: config.resolveSecret("ZENTAO_BASE_URL"),
            token: config.resolveSecret("ZENTAO_TOKEN"),
            dryRun,
          })
        : await mockSyncIssueToZentao(draft, {
            dryRun: true,
          });
    const resultPath = `reports/issues/${draft.sourceBugId}.issue-sync-result.json`;
    writeJsonArtifact(
      location,
      "IssueSyncResult",
      resultPath,
      result,
      "issue sync",
      {
        allowedScopes: ["feature.reports"],
      },
    );
    console.log(JSON.stringify({ path: resultPath, result }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (command === "test-case-gen") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const sourceUrl = requireArg("--source-url");
  const runId = argValue("--run") ?? randomUUID();
  const { executor } = createRuntimeServices({
    rootDir,
    mode: runtimeMode(),
    browserType: browserType(),
    notifyMode: notifyMode(),
  });
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

if (command === "ui-script-gen") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const testSpecPath = requireArg("--test-spec");
  const runId = argValue("--run") ?? randomUUID();
  const mode = runtimeMode();
  const browser = browserType();
  const input: UiScriptGenInput = {
    schemaVersion: "0.1",
    project,
    feature,
    testSpecPath,
    mode,
  };
  try {
    assertValidSchema("UiScriptGenInput", input);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const { executor } = createRuntimeServices({
    rootDir,
    mode,
    browserType: browser,
    requireProviderConfig: false,
    notifyMode: notifyMode(),
  });
  const result = await executor.start({
    location: { rootDir, project, feature },
    definition: loadWorkflowDefinition("ui-script-gen"),
    runId,
    inputs: { testSpecPath, mode },
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
  const state = loadWorkflowState(targetFeatureDir, runId);
  const { executor } = createRuntimeServices({
    rootDir: location.rootDir,
    mode: runtimeMode(),
    browserType: browserType(),
    requireProviderConfig: state.workflowId !== "ui-script-gen",
    notifyMode: notifyMode(),
  });
  const result = await executor.resume({
    location,
    definition: loadWorkflowDefinition(state.workflowId),
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
