#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import {
  readArtifactIndex,
  readJsonArtifact,
  writeArtifact,
  writeArtifactInFeatureDir,
  writeJsonArtifact,
} from "../../../packages/artifact-repo/src/index";
import { LocalConfigLoader } from "../../../packages/core/src/index";
import {
  assertValidSchema,
  type ArtifactRef,
  type BugReport,
  type ConfirmationResult,
  type EvidencePack,
  type HotfixCaseGenInput,
  type IssueDraft,
  type LanhuWritebackDraft,
  type PlaywrightRealOptions,
  type RequirementGapReport,
  type RequirementSpec,
  type ReportGenInput,
  type ReviewReport,
  type RunRecord,
  type SourceRepoRef,
  type StaticScanInput,
  type UiScriptGenInput,
} from "../../../packages/domain/src/index";
import { listSuggestions } from "../../../packages/knowledge-repo/src/index";
import {
  acceptSuggestion,
  rejectSuggestion,
  searchKnowledge,
} from "../../../packages/knowledge-repo/src/index";
import {
  appendTrace,
  buildAutomationFailureReport,
  buildBugReport,
  buildConflictReport,
  buildHotfixTestSpec,
  buildIssueDraftsFromBugReport,
  buildLanhuWritebackDraft,
  createRuntimeServices,
  issueDraftPath,
  loadWorkflowState,
  markBlocked,
  markSucceeded,
  renderAutomationReportMarkdown,
  saveWorkflowState,
  renderTestSpecMarkdown,
  type RuntimeFactoryOptions,
  type WorkflowDefinition,
} from "../../../packages/workflow-engine/src/index";
import { mockWriteLanhuRequirement } from "../../../plugins/lanhu-writeback/src/mock";
import { scanStaticDiff } from "../../../plugins/static-scan/src/scan";
import { writeLanhuRequirement } from "../../../plugins/lanhu-writeback/src/real";
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

function parseTrustedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

function requireArtifactRefByPath(
  index: { artifacts: ArtifactRef[] },
  type: string,
  path: string,
): ArtifactRef {
  const ref = index.artifacts.find(
    (item) => item.type === type && item.path === path,
  );
  if (!ref) {
    console.error(`Missing ${type} artifact: ${path}`);
    process.exit(1);
  }
  return ref;
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

if (command === "knowledge search") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const query = requireArg("--query");
  console.log(
    JSON.stringify(searchKnowledge({ rootDir, project }, query), null, 2),
  );
  process.exit(0);
}

if (command === "knowledge accept") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const suggestion = requireArg("--suggestion");
  console.log(
    JSON.stringify(acceptSuggestion({ rootDir, project }, suggestion), null, 2),
  );
  process.exit(0);
}

if (command === "knowledge reject") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const suggestion = requireArg("--suggestion");
  const reason = argValue("--reason") ?? "rejected by user";
  console.log(
    JSON.stringify(
      rejectSuggestion({ rootDir, project }, suggestion, reason),
      null,
      2,
    ),
  );
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

if (command === "lanhu writeback-draft") {
  const targetFeatureDir = requireArg("--feature-dir");
  const specPath = requireArg("--requirement-spec");
  const targetUrl = requireArg("--target-url");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const specRef = index.artifacts.find(
    (item) => item.type === "RequirementSpec" && item.path === specPath,
  );
  if (!specRef) {
    console.error(`Missing RequirementSpec artifact: ${specPath}`);
    process.exit(1);
  }
  const spec = readJsonArtifact<RequirementSpec>(
    location,
    specRef,
    "RequirementSpec",
  );
  const draft = buildLanhuWritebackDraft(specRef, spec, targetUrl);
  writeJsonArtifact(
    location,
    "LanhuWritebackDraft",
    "reports/lanhu-writeback-draft.json",
    draft,
    "lanhu writeback-draft",
    { allowedScopes: ["feature.reports"] },
  );
  console.log(
    JSON.stringify({ path: "reports/lanhu-writeback-draft.json" }, null, 2),
  );
  process.exit(0);
}

if (command === "lanhu writeback") {
  const targetFeatureDir = requireArg("--feature-dir");
  const draftPath = requireArg("--draft");
  const dryRun = booleanFlag("--dry-run");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const draftRef = index.artifacts.find(
    (item) => item.type === "LanhuWritebackDraft" && item.path === draftPath,
  );
  if (!draftRef) {
    console.error(`Missing LanhuWritebackDraft artifact: ${draftPath}`);
    process.exit(1);
  }
  const draft = readJsonArtifact<LanhuWritebackDraft>(
    location,
    draftRef,
    "LanhuWritebackDraft",
  );
  try {
    const config = new LocalConfigLoader({ rootDir: location.rootDir });
    const trustedDomains = parseTrustedDomains(
      config.resolveSecret("LANHU_WRITEBACK_ALLOWED_HOSTS"),
    );
    const result =
      runtimeMode() === "real"
        ? await writeLanhuRequirement(draft, {
            cookie: config.resolveSecret("LANHU_WRITEBACK_COOKIE"),
            trustedDomains,
            dryRun,
          })
        : await mockWriteLanhuRequirement(draft, { dryRun: true });
    writeJsonArtifact(
      location,
      "LanhuWritebackResult",
      "reports/lanhu-writeback-result.json",
      result,
      "lanhu writeback",
      { allowedScopes: ["feature.reports"] },
    );
    console.log(
      JSON.stringify(
        { path: "reports/lanhu-writeback-result.json", result },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (command === "static-scan") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const repoId = requireArg("--repo-id");
  const sourceRoot = requireArg("--source-root");
  const diffFile = requireArg("--diff-file");
  const location = { rootDir, project, feature };
  const sourceRepoRefPath = "reports/static-scan/source-repo-ref.json";
  const staticScanInputPath = "reports/static-scan/static-scan-input.json";
  const inspectionReportPath = "reports/static-scan/inspection-report.json";

  try {
    const sourceRepo: SourceRepoRef = {
      schemaVersion: "0.1",
      repoId,
      sourceRoot,
      readOnly: true,
    };
    const sourceRepoRef = writeJsonArtifact(
      location,
      "SourceRepoRef",
      sourceRepoRefPath,
      sourceRepo,
      "static-scan",
      { allowedScopes: ["feature.reports"] },
    );
    const input: StaticScanInput = {
      schemaVersion: "0.1",
      project,
      feature,
      sourceRepoRef: sourceRepoRef.id,
      diffText: readFileSync(diffFile, "utf8"),
    };
    writeJsonArtifact(
      location,
      "StaticScanInput",
      staticScanInputPath,
      input,
      "static-scan",
      { allowedScopes: ["feature.reports"] },
    );
    writeJsonArtifact(
      location,
      "InspectionReport",
      inspectionReportPath,
      scanStaticDiff(input),
      "static-scan",
      { allowedScopes: ["feature.reports"] },
    );
    console.log(
      JSON.stringify(
        { sourceRepoRefPath, staticScanInputPath, inspectionReportPath },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (command === "report-gen") {
  const targetFeatureDir = requireArg("--feature-dir");
  const runRecordPath = requireArg("--run-record");
  const evidencePackPath = requireArg("--evidence-pack");
  const reviewReportPath = requireArg("--review-report");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const runRecordRef = requireArtifactRefByPath(
    index,
    "RunRecord",
    runRecordPath,
  );
  const evidencePackRef = requireArtifactRefByPath(
    index,
    "EvidencePack",
    evidencePackPath,
  );
  const reviewReportRef = requireArtifactRefByPath(
    index,
    "ReviewReport",
    reviewReportPath,
  );
  const input: ReportGenInput = {
    schemaVersion: "0.1",
    project: location.project,
    feature: location.feature,
    runRecordRef: runRecordRef.id,
    evidencePackRef: evidencePackRef.id,
    reviewReportRef: reviewReportRef.id,
  };
  const bugReportPath = "reports/bug-report.json";
  const automationFailureReportPath = "reports/automation-failure-report.json";
  const conflictReportPath = "reports/conflict-report.json";
  const automationReportMarkdownPath = "reports/automation-report.md";

  try {
    assertValidSchema("ReportGenInput", input);
    const runRecord = readJsonArtifact<RunRecord>(
      location,
      runRecordRef,
      "RunRecord",
    );
    const evidencePack = readJsonArtifact<EvidencePack>(
      location,
      evidencePackRef,
      "EvidencePack",
    );
    if (evidencePack.runRecordRef !== runRecordRef.id) {
      throw new Error(
        `EvidencePack does not reference RunRecord: ${evidencePack.runRecordRef} !== ${runRecordRef.id}`,
      );
    }
    const reviewReport = readJsonArtifact<ReviewReport>(
      location,
      reviewReportRef,
      "ReviewReport",
    );
    writeJsonArtifact(
      location,
      "BugReport",
      bugReportPath,
      buildBugReport(runRecord, evidencePack),
      "report-gen",
      { allowedScopes: ["feature.reports"] },
    );
    writeJsonArtifact(
      location,
      "AutomationFailureReport",
      automationFailureReportPath,
      buildAutomationFailureReport(runRecordRef.id, runRecord),
      "report-gen",
      { allowedScopes: ["feature.reports"] },
    );
    writeJsonArtifact(
      location,
      "ConflictReport",
      conflictReportPath,
      buildConflictReport(
        reviewReportRef.id,
        location.project,
        location.feature,
        reviewReport,
      ),
      "report-gen",
      { allowedScopes: ["feature.reports"] },
    );
    writeArtifact(
      location,
      "AutomationReportMarkdown",
      automationReportMarkdownPath,
      renderAutomationReportMarkdown(runRecord),
      "report-gen",
      { allowedScopes: ["feature.reports"] },
    );
    console.log(
      JSON.stringify(
        {
          bugReportPath,
          automationFailureReportPath,
          conflictReportPath,
          automationReportMarkdownPath,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (command === "hotfix-case-gen") {
  const targetFeatureDir = requireArg("--feature-dir");
  const issueDraftArtifactPath = requireArg("--issue-draft");
  const sourceRepoArtifactPath = requireArg("--source-repo");
  const location = parseFeatureDir(targetFeatureDir);
  const index = readArtifactIndex(location);
  const issueDraftRef = requireArtifactRefByPath(
    index,
    "IssueDraft",
    issueDraftArtifactPath,
  );
  const sourceRepoRef = requireArtifactRefByPath(
    index,
    "SourceRepoRef",
    sourceRepoArtifactPath,
  );
  const input: HotfixCaseGenInput = {
    schemaVersion: "0.1",
    project: location.project,
    feature: location.feature,
    issueDraftRef: issueDraftRef.id,
    sourceRepoRef: sourceRepoRef.id,
  };
  const testSpecPath = "test-spec/hotfix-test-spec.json";
  const testSpecMarkdownPath = "test-spec/hotfix-test-spec.md";

  try {
    assertValidSchema("HotfixCaseGenInput", input);
    const issueDraft = readJsonArtifact<IssueDraft>(
      location,
      issueDraftRef,
      "IssueDraft",
    );
    const sourceRepo = readJsonArtifact<SourceRepoRef>(
      location,
      sourceRepoRef,
      "SourceRepoRef",
    );
    const testSpec = buildHotfixTestSpec(
      issueDraftRef.id,
      issueDraft,
      sourceRepo,
    );
    writeJsonArtifact(
      location,
      "TestSpec",
      testSpecPath,
      testSpec,
      "hotfix-case-gen",
      { allowedScopes: ["feature.test-spec"] },
    );
    writeArtifact(
      location,
      "TestSpecMarkdown",
      testSpecMarkdownPath,
      renderTestSpecMarkdown(testSpec),
      "hotfix-case-gen",
      { allowedScopes: ["feature.test-spec"] },
    );
    console.log(
      JSON.stringify({ testSpecPath, testSpecMarkdownPath }, null, 2),
    );
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
  const location = parseFeatureDir(featureDir);
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
  const rejectedP0 = rejectedP0Gaps(location, confirmation);
  if (rejectedP0.length > 0) {
    const rebuttalRef = writeArtifactInFeatureDir(
      featureDir,
      "ClarificationRebuttalMarkdown",
      "reports/clarification-rebuttal.md",
      renderClarificationRebuttal(rejectedP0),
      "confirmation import",
      {
        allowedScopes: ["feature.reports"],
        project,
        feature,
      },
    );
    saveWorkflowState(
      featureDir,
      markBlocked(state, waitingNode, "rejected P0 confirmation answers"),
    );
    appendTrace(featureDir, {
      runId,
      nodeId: waitingNode,
      type: "human-import",
      artifactRefs: [ref.id, rebuttalRef.id],
      message: "rejected P0 confirmation answers",
      at: new Date().toISOString(),
    });
    console.log(`confirmation rejected for ${runId}:${waitingNode}`);
    process.exit(0);
  }

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

function rejectedP0Gaps(
  location: { rootDir: string; project: string; feature: string },
  confirmation: ConfirmationResult,
): Array<{ id: string; question: string; answer?: string }> {
  const index = readArtifactIndex(location);
  const gapRef = index.artifacts.find(
    (item) => item.type === "RequirementGapReport",
  );
  if (!gapRef) return [];
  const report = readJsonArtifact<RequirementGapReport>(
    location,
    gapRef,
    "RequirementGapReport",
  );
  const answers = new Map(
    confirmation.answers.map((answer) => [answer.questionId, answer]),
  );
  return report.gaps
    .filter((gap) => gap.severity === "P0")
    .filter((gap) => answers.get(gap.id)?.status === "rejected")
    .map((gap) => ({
      id: gap.id,
      question: gap.question,
      answer: answers.get(gap.id)?.answer,
    }));
}

function renderClarificationRebuttal(
  gaps: Array<{ id: string; question: string; answer?: string }>,
): string {
  const lines = [
    "# Clarification Rebuttal",
    "",
    "The following P0 clarification answers were rejected. Update the clarification dossier and rerun the human confirmation node.",
    "",
    "## Rejected P0 Gaps",
  ];
  for (const gap of gaps) {
    lines.push(`- ${gap.id}: ${gap.question}`);
    if (gap.answer) lines.push(`  - Answer: ${gap.answer}`);
  }
  return `${lines.join("\n")}\n`;
}
