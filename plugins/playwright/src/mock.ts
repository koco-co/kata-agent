import type { RunPlan, RunRecord } from "../../../packages/domain/src/index";
import type { PluginActionContext } from "../../../packages/plugin-runtime/src/index";
import { writeArtifact } from "../../../packages/artifact-repo/src/index";

const EVIDENCE_PATH = "automation/evidence/run-log.txt";
const MOCK_TIMESTAMP = "2026-05-01T00:00:00.000Z";

export async function mockRunPlan(
  input: RunPlan,
  context: PluginActionContext,
): Promise<RunRecord> {
  if (input.runner !== "playwright") {
    throw new Error("INVALID_INPUT runner must be playwright");
  }
  if (input.mode !== "mock") {
    throw new Error("INVALID_INPUT mockRunPlan only accepts mock mode");
  }

  const evidenceContent = input.flows
    .map((flow) => `${flow.testCaseId} passed`)
    .join("\n");
  writeArtifact(
    context,
    "AutomationEvidenceLog",
    EVIDENCE_PATH,
    evidenceContent,
    "playwright.mock",
    { allowedScopes: ["feature.automation"] },
  );

  return {
    schemaVersion: "0.1",
    project: input.project,
    feature: input.feature,
    runId: `playwright-${input.project}-${input.feature}`,
    runner: "playwright",
    status: "passed",
    startedAt: MOCK_TIMESTAMP,
    finishedAt: MOCK_TIMESTAMP,
    caseResults: input.flows.map((flow) => ({
      testCaseId: flow.testCaseId,
      status: "passed",
      assertionResults: flow.assertions.map((assertion) => ({
        assertionId: assertion.id,
        status: "passed",
        expected: assertion.expected,
        actual: assertion.expected,
      })),
    })),
    evidenceFiles: [EVIDENCE_PATH],
  };
}
