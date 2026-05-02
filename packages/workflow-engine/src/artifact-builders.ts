import { createHash } from "node:crypto";
import { basename } from "node:path";
import type {
  ArtifactRef,
  ClarificationDossier,
  ConfirmationDraft,
  DesignReport,
  EvidenceKind,
  EvidencePack,
  FlowAssertionKind,
  FlowSpec,
  RequirementSpec,
  RequirementAnalysisInput,
  RequirementAuthorInput,
  RunMode,
  RunPlan,
  RunRecord,
  TestSpec,
  TestSpecAuthorInput,
  TestSpecReviewerInput,
} from "../../domain/src/index";
import type { GateResult } from "./gates";
import type { TraceEvent } from "./types";

export { buildBugReport } from "./bug-report-builder";

export function buildRequirementAnalysisInput(
  requirementDraftRef: ArtifactRef,
  knowledgeConsultRef: ArtifactRef,
): RequirementAnalysisInput {
  return {
    schemaVersion: "0.1",
    requirementDraftRef: requirementDraftRef.id,
    knowledgeConsultRef: knowledgeConsultRef.id,
  };
}

export function buildRequirementAuthorInput(
  requirementDraftRef: ArtifactRef,
  gapReportRef: ArtifactRef,
  clarificationDossierRef: ArtifactRef,
  confirmationResultRef: ArtifactRef,
): RequirementAuthorInput {
  return {
    schemaVersion: "0.1",
    requirementDraftRef: requirementDraftRef.id,
    gapReportRef: gapReportRef.id,
    clarificationDossierRef: clarificationDossierRef.id,
    confirmationResultRef: confirmationResultRef.id,
  };
}

export function buildTestSpecAuthorInput(
  testPointSetRef: ArtifactRef,
  requirementSpecRef: ArtifactRef,
): TestSpecAuthorInput {
  return {
    schemaVersion: "0.1",
    testPointSetRef: testPointSetRef.id,
    requirementSpecRef: requirementSpecRef.id,
  };
}

export function buildTestSpecReviewerInput(
  testSpecRef: ArtifactRef,
  requirementSpecRef: ArtifactRef,
): TestSpecReviewerInput {
  return {
    schemaVersion: "0.1",
    testSpecRef: testSpecRef.id,
    requirementSpecRef: requirementSpecRef.id,
  };
}

const FLOW_ASSERTION_KINDS = new Set<FlowAssertionKind>([
  "text",
  "url",
  "visibility",
  "network",
  "state",
]);

function flowAssertionKind(kind: string): FlowAssertionKind {
  return FLOW_ASSERTION_KINDS.has(kind as FlowAssertionKind)
    ? (kind as FlowAssertionKind)
    : "text";
}

function flowId(index: number): string {
  return `FLOW-${String(index + 1).padStart(3, "0")}`;
}

function evidenceId(index: number): string {
  return `EVID-${String(index + 1).padStart(3, "0")}`;
}

function selectorFromTarget(target: string): string {
  const trimmed = target.trim();
  if (trimmed.length === 0) return "body";
  if (trimmed.startsWith("button:")) return `text=${trimmed.slice(7)}`;
  return trimmed;
}

function scriptString(value: string): string {
  return JSON.stringify(value);
}

function evidenceKind(path: string): EvidenceKind {
  const file = basename(path).toLowerCase();
  if (file.includes("console")) return "console";
  if (file.includes("network")) return "network";
  if (file.includes("dom")) return "dom-snapshot";
  if (file.endsWith(".png")) return "screenshot";
  if (file.endsWith(".zip") || file.includes("trace")) return "trace";
  return "run-log";
}

function stableEvidenceHash(path: string): string {
  return `sha256:${createHash("sha256").update(path).digest("hex")}`;
}

export function buildFlowSpecFromTestSpec(
  testSpecRef: ArtifactRef,
  spec: TestSpec,
): FlowSpec {
  const flows: FlowSpec["flows"] = [];

  for (const module of spec.modules) {
    for (const testCase of module.cases) {
      if (
        testCase.automation.surface !== "web" ||
        testCase.automation.readiness !== "ready"
      ) {
        continue;
      }

      const assertionRefs = testCase.assertions.map((assertion) => assertion.id);
      flows.push({
        id: flowId(flows.length),
        title: testCase.title,
        testCaseId: testCase.id,
        priority: testCase.priority,
        surface: "web",
        entry: { url: `/${spec.feature}` },
        steps: testCase.steps.map((step) => ({
          id: step.id,
          action: step.action,
          target: step.action,
          expected: step.expected,
          assertionRefs,
        })),
        assertions: testCase.assertions.map((assertion) => ({
          id: assertion.id,
          layer: assertion.layer,
          kind: flowAssertionKind(assertion.kind),
          target: assertion.target,
          expected: assertion.expected,
          requirementRefs: [...assertion.requirementRefs],
        })),
      });
    }
  }

  return {
    schemaVersion: "0.1",
    project: spec.project,
    feature: spec.feature,
    sourceTestSpecRef: testSpecRef.id,
    flows,
  };
}

export function buildRunPlanFromFlowSpec(
  flowSpecRef: ArtifactRef,
  flow: FlowSpec,
  mode: RunMode,
): { plan: RunPlan; script: string } {
  const plan: RunPlan = {
    schemaVersion: "0.1",
    project: flow.project,
    feature: flow.feature,
    runner: "playwright",
    mode,
    sourceFlowSpecRef: flowSpecRef.id,
    scriptPath: "automation/playwright/generated.spec.ts",
    flows: flow.flows.map((item) => ({
      flowId: item.id,
      testCaseId: item.testCaseId,
      title: item.title,
      entryUrl: item.entry.url,
      steps: item.steps.map((step) => ({
        id: step.id,
        action: step.action,
        selector: selectorFromTarget(step.target),
        expected: step.expected,
      })),
      assertions: item.assertions.map((assertion) => ({
        id: assertion.id,
        layer: assertion.layer,
        kind: assertion.kind,
        selector: selectorFromTarget(assertion.target),
        expected: assertion.expected,
      })),
    })),
  };

  const lines = [
    'import { expect, test } from "@playwright/test";',
    "",
  ];
  for (const item of plan.flows) {
    lines.push(`test(${scriptString(item.title)}, async ({ page }) => {`);
    lines.push(`  await page.goto(${scriptString(item.entryUrl)});`);
    for (const step of item.steps) {
      if (step.action.includes("点击") || step.action.toLowerCase().includes("click")) {
        lines.push(`  await page.locator(${scriptString(step.selector)}).click();`);
      }
    }
    for (const assertion of item.assertions) {
      const selector = scriptString(assertion.selector);
      if (assertion.kind === "visibility") {
        lines.push(`  await expect(page.locator(${selector})).toBeVisible();`);
      } else if (assertion.kind === "url") {
        lines.push(`  await expect(page).toHaveURL(${scriptString(assertion.expected)});`);
      } else {
        lines.push(
          `  await expect(page.locator(${selector})).toContainText(${scriptString(assertion.expected)});`,
        );
      }
    }
    lines.push("});", "");
  }

  return { plan, script: lines.join("\n") };
}

export function buildEvidencePackFromRunRecord(
  runRecordRef: ArtifactRef,
  record: RunRecord,
): EvidencePack {
  return {
    schemaVersion: "0.1",
    project: record.project,
    feature: record.feature,
    runRecordRef: runRecordRef.id,
    evidence: record.evidenceFiles.map((path, index) => ({
      id: evidenceId(index),
      kind: evidenceKind(path),
      path,
      hash: stableEvidenceHash(path),
    })),
  };
}

export function renderAutomationReportMarkdown(record: RunRecord): string {
  const lines = [
    "# Automation Report",
    "",
    `- Project: ${record.project}`,
    `- Feature: ${record.feature}`,
    `- Run ID: ${record.runId}`,
    `- Runner: ${record.runner}`,
    `- Status: ${record.status}`,
    `- Started: ${record.startedAt}`,
    `- Finished: ${record.finishedAt}`,
    "",
    "## Cases",
  ];

  for (const result of record.caseResults) {
    lines.push("", `### ${result.testCaseId}`, "", `- Status: ${result.status}`);
    for (const assertion of result.assertionResults) {
      lines.push(
        `- ${assertion.assertionId}: ${assertion.status} (expected: ${assertion.expected})`,
      );
      if (assertion.actual) {
        lines.push(`  - Actual: ${assertion.actual}`);
      }
      if (assertion.message) {
        lines.push(`  - Message: ${assertion.message}`);
      }
    }
  }

  if (record.evidenceFiles.length > 0) {
    lines.push("", "## Evidence");
    for (const file of record.evidenceFiles) {
      lines.push(`- ${file}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderConfirmationDraft(
  dossierRef: ArtifactRef,
  dossier: ClarificationDossier,
): { draft: ConfirmationDraft; markdown: string } {
  const lines = [
    "# 需求澄清确认",
    "",
    dossier.summary,
    "",
    ...dossier.questions.map(
      (question) =>
        `- [${question.severity}] ${question.id}: ${question.question}`,
    ),
  ];
  return {
    draft: {
      schemaVersion: "0.1",
      clarificationDossierRef: dossierRef.id,
      renderedMarkdownPath: "requirement/clarifications/confirmation-draft.md",
      renderedAt: new Date().toISOString(),
    },
    markdown: `${lines.join("\n")}\n`,
  };
}

export function renderRequirementSpecMarkdown(
  requirement: RequirementSpec,
): string {
  const lines = [
    `# ${requirement.title}`,
    "",
    `- Project: ${requirement.project}`,
    `- Feature: ${requirement.feature}`,
    `- Status: ${requirement.status}`,
    "",
    "## Rules",
    ...noneIfEmpty(
      requirement.rules.map(
        (rule) =>
          `- [${rule.severity}] ${rule.id}: ${rule.text} (source: ${rule.sourceType})`,
      ),
    ),
    "",
    "## Page Contracts",
    ...noneIfEmpty(
      requirement.pageContracts.map(
        (contract) =>
          `- ${contract.id}: ${contract.name} (${contract.surface})`,
      ),
    ),
    "",
    "## Open Items",
    ...noneIfEmpty(
      requirement.openItems.map(
        (item) =>
          `- [${item.severity}/${item.status}] ${item.id}: ${item.question}`,
      ),
    ),
    "",
    "## Assumptions",
    ...noneIfEmpty(
      requirement.assumptions.map(
        (assumption) =>
          `- [${assumption.risk}] ${assumption.id}: ${assumption.content}`,
      ),
    ),
    "",
  ];
  return lines.join("\n");
}

export function renderTestSpecMarkdown(spec: TestSpec): string {
  const lines = [
    `# ${spec.title}`,
    "",
    `- Project: ${spec.project}`,
    `- Feature: ${spec.feature}`,
    `- Status: ${spec.status}`,
    `- Requirement: ${spec.requirementRef}`,
    "",
  ];

  for (const module of spec.modules) {
    lines.push(`## ${module.name}`, "", `- Module ID: ${module.id}`);
    for (const testCase of module.cases) {
      lines.push("", `### [${testCase.priority}] ${testCase.id}: ${testCase.title}`, "");
      lines.push(`- Requirements: ${testCase.requirementRefs.join(", ")}`);
      lines.push(
        `- Automation: ${testCase.automation.surface}/${testCase.automation.readiness}`,
      );
      lines.push("", "#### Steps");
      lines.push(
        ...noneIfEmpty(
          testCase.steps.map(
            (step) => `- ${step.id}: ${step.action} => ${step.expected}`,
          ),
        ),
      );
      lines.push("", "#### Assertions");
      lines.push(
        ...noneIfEmpty(
          testCase.assertions.map(
            (assertion) =>
              `- ${assertion.id} [${assertion.layer}/${assertion.kind}] ${assertion.target} => ${assertion.expected}`,
          ),
        ),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildDesignReport(
  artifactRefs: ArtifactRef[],
  gateResults: GateResult[],
  traceEvents: TraceEvent[],
): DesignReport {
  return {
    schemaVersion: "0.1",
    summary: `Generated ${artifactRefs.length} artifacts and ${traceEvents.length} trace events.`,
    artifactRefs: artifactRefs.map((ref) => ref.id),
    gateResults: gateResults.map((result) => ({
      gateId: result.gateId ?? "unknown",
      passed: result.passed,
      violations: result.violations,
    })),
  };
}

function noneIfEmpty(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None"];
}

export {
  buildIssueDraftsFromBugReport,
  buildLanhuWritebackDraft,
  issueDraftPath,
} from "./collaboration-builders";
