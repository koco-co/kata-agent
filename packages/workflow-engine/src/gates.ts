import type {
  ConfirmationResult,
  RequirementGapReport,
  RequirementSpec,
  RequirementSourceBundle,
  TestSpec,
  XMindExport,
} from "../../domain/src/index";
import { validateAutomationAssertions } from "./automation-policy";

export interface GateViolation {
  id: string;
  severity: "error" | "warning";
  message: string;
}

export interface GateResult {
  gateId?: string;
  passed: boolean;
  violations: GateViolation[];
}

export function checkSourceIntegrity(
  source: RequirementSourceBundle,
): GateResult {
  const violations: GateViolation[] = [];
  if (!source.title?.trim()) {
    violations.push({
      id: "source-title",
      severity: "error",
      message: "Requirement source must include a title",
    });
  }
  const hasText = source.textBlocks.some((block) => block.content.trim());
  const hasImage = source.images.length > 0;
  if (!hasText && !hasImage) {
    violations.push({
      id: "source-content",
      severity: "error",
      message: "Requirement source must include at least one text block or image",
    });
  }
  if (source.rawFiles.length === 0) {
    violations.push({
      id: "source-raw-files",
      severity: "error",
      message: "Requirement source must reference raw source files",
    });
  }
  return {
    gateId: "source-integrity",
    passed: violations.length === 0,
    violations,
  };
}

export function checkRequirementClarity(
  gaps: RequirementGapReport,
  confirmation: ConfirmationResult,
): GateResult {
  const answered = new Set(
    confirmation.answers
      .filter((answer) => answer.status === "confirmed")
      .map((answer) => answer.questionId),
  );
  const violations = gaps.gaps
    .filter((gap) => gap.severity === "P0" && !answered.has(gap.id))
    .map((gap) => ({
      id: gap.id,
      severity: "error" as const,
      message: `Unresolved P0 gap: ${gap.question}`,
    }));
  return { passed: violations.length === 0, violations };
}

export function checkEvidenceBinding(requirement: RequirementSpec): GateResult {
  const violations: GateViolation[] = [];
  for (const rule of requirement.rules) {
    if (
      (rule.severity === "P0" || rule.severity === "P1") &&
      rule.sourceType === "unknown"
    ) {
      violations.push({
        id: rule.id,
        severity: rule.severity === "P0" ? "error" : "warning",
        message: `P0/P1 rule lacks evidence binding: ${rule.text}`,
      });
    }
    if (rule.sourceType === "confirmation" && !rule.confirmationQuestionId) {
      violations.push({
        id: rule.id,
        severity: "error",
        message: `Confirmed rule must reference ConfirmationResult question: ${rule.text}`,
      });
    }
    if (
      rule.severity === "P1" &&
      rule.sourceType === "assumption" &&
      !rule.assumptionRef
    ) {
      violations.push({
        id: rule.id,
        severity: "warning",
        message: `Assumed P1 rule must reference an assumption: ${rule.text}`,
      });
    }
  }
  for (const item of requirement.openItems) {
    if (item.severity === "P0" && item.status === "unconfirmed") {
      violations.push({
        id: item.id,
        severity: "error",
        message: `Unconfirmed P0 item: ${item.question}`,
      });
    }
  }
  return { passed: violations.length === 0, violations };
}

export function checkTestSpecValidity(spec: TestSpec): GateResult {
  const violations: GateViolation[] = [];
  const seen = new Set<string>();
  for (const module of spec.modules) {
    for (const testCase of module.cases) {
      if (testCase.requirementRefs.length === 0) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Test case must include requirementRefs",
        });
      }
      if (
        (testCase.priority === "P0" || testCase.priority === "P1") &&
        testCase.assertions.length === 0
      ) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "P0/P1 case must include at least one assertion",
        });
      }
      const emptyExpectation = testCase.assertions.some((assertion) =>
        ["验证功能正常", "正常"].includes(assertion.expected.trim()),
      );
      if (emptyExpectation) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Assertion expectation is too vague",
        });
      }
      const signature = JSON.stringify({
        steps: testCase.steps.map((step) => [
          step.action.trim(),
          step.expected.trim(),
        ]),
        assertions: testCase.assertions.map((assertion) => [
          assertion.kind,
          assertion.target,
          assertion.expected.trim(),
        ]),
      });
      if (seen.has(signature)) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Duplicate test case by steps and assertions",
        });
      }
      seen.add(signature);
    }
  }
  return { passed: violations.length === 0, violations };
}

export function checkAutomationReadiness(
  spec: TestSpec,
  requirement: RequirementSpec,
): GateResult {
  const violations: GateViolation[] = [];
  const pageContractIds = new Set(
    requirement.pageContracts.map((page) => page.id),
  );
  for (const module of spec.modules) {
    for (const testCase of module.cases) {
      if (
        (testCase.priority === "P0" || testCase.priority === "P1") &&
        testCase.automation.readiness === "ready" &&
        testCase.assertions.length === 0
      ) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Ready P0/P1 case must include assertions",
        });
      }
      if (
        (testCase.priority === "P0" || testCase.priority === "P1") &&
        testCase.automation.readiness === "ready" &&
        !testCase.automation.uiContractRefs.some((ref) =>
          pageContractIds.has(ref),
        )
      ) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Ready P0/P1 case must reference a UI contract",
        });
      }
    }
  }
  return { passed: violations.length === 0, violations };
}

export function checkAutomationScriptReadiness(spec: TestSpec): GateResult {
  return {
    gateId: "automation-script-readiness",
    ...validateAutomationAssertions(spec),
  };
}

export function checkArtifactConsistency(
  spec: TestSpec,
  xmind: XMindExport,
  artifactViolations: GateViolation[] = [],
): GateResult {
  const testSpecCaseCount = spec.modules.reduce(
    (count, module) => count + module.cases.length,
    0,
  );
  const violations: GateViolation[] = [...artifactViolations];
  if (xmind.caseCount !== testSpecCaseCount) {
    violations.push({
      id: "xmind-case-count",
      severity: "error",
      message: `XMind case count ${xmind.caseCount} does not match TestSpec case count ${testSpecCaseCount}`,
    });
  }
  return {
    gateId: "artifact-consistency",
    passed: violations.every((violation) => violation.severity !== "error"),
    violations,
  };
}

export const GATE_REGISTRY = {
  "source-integrity": {
    id: "source-integrity",
    checks: [checkSourceIntegrity],
  },
  "requirement-test-readiness": {
    id: "requirement-test-readiness",
    checks: [
      checkEvidenceBinding,
      checkRequirementClarity,
      checkTestSpecValidity,
      checkAutomationReadiness,
    ],
  },
  "automation-script-readiness": {
    id: "automation-script-readiness",
    checks: [checkAutomationScriptReadiness],
  },
  "artifact-consistency": {
    id: "artifact-consistency",
    checks: [checkArtifactConsistency],
  },
} as const;
