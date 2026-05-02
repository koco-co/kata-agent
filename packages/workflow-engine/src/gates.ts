import { createHash } from "node:crypto";
import type { HardRule } from "../../core/src/index";
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

export interface SourceIntegrityContext {
  rawFileContents?: Record<string, string | Uint8Array>;
}

export interface MarkdownConsistencyArtifact {
  id: string;
  path: string;
  expected: string;
  actual: string;
}

export interface ArtifactConsistencyContext {
  markdownArtifacts?: MarkdownConsistencyArtifact[];
  hashViolations?: GateViolation[];
}

export function checkSourceIntegrity(
  source: RequirementSourceBundle,
  context: SourceIntegrityContext = {},
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
  for (const rawFile of source.rawFiles) {
    const content = context.rawFileContents?.[rawFile.path];
    if (content === undefined) continue;
    const actual = sha256(content);
    if (actual !== rawFile.hash) {
      violations.push({
        id: rawFile.id,
        severity: "error",
        message: `Raw source file hash mismatch: ${rawFile.path}`,
      });
    }
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
  requirement?: RequirementSpec,
): GateResult {
  const confirmed = new Set(
    confirmation.answers
      .filter((answer) => answer.status === "confirmed")
      .map((answer) => answer.questionId),
  );
  const assumed = new Set(
    confirmation.answers
      .filter((answer) => answer.status === "assumed")
      .map((answer) => answer.questionId),
  );
  const openItems = new Set(
    requirement?.openItems
      .filter((item) => item.status !== "confirmed")
      .map((item) => item.id) ?? [],
  );
  const violations: GateViolation[] = [];
  for (const gap of gaps.gaps) {
    if (gap.severity === "P0" && !confirmed.has(gap.id)) {
      violations.push({
        id: gap.id,
        severity: "error",
        message: `Unresolved P0 gap: ${gap.question}`,
      });
    }
    if (
      gap.severity === "P1" &&
      !confirmed.has(gap.id) &&
      !assumed.has(gap.id) &&
      !openItems.has(gap.id)
    ) {
      violations.push({
        id: gap.id,
        severity: "warning",
        message: `Unresolved P1 gap: ${gap.question}`,
      });
    }
  }
  return {
    passed: violations.every((violation) => violation.severity !== "error"),
    violations,
  };
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
        testCase.steps.length === 0
      ) {
        violations.push({
          id: `${testCase.id}:entry`,
          severity: "error",
          message: "Ready P0/P1 case must include an executable entry/action step",
        });
      }
      for (const step of testCase.steps) {
        if (testCase.automation.readiness === "ready" && !step.action.trim()) {
          violations.push({
            id: `${testCase.id}:step-action`,
            severity: "error",
            message: "Ready automation step must include an action target",
          });
        }
        if (testCase.automation.readiness === "ready" && !step.expected.trim()) {
          violations.push({
            id: `${testCase.id}:step-expected`,
            severity: "error",
            message: "Ready automation step must include expected result",
          });
        }
      }
      for (const assertion of testCase.assertions) {
        if (testCase.automation.readiness === "ready" && !assertion.target.trim()) {
          violations.push({
            id: `${assertion.id}:target`,
            severity: "error",
            message: "Ready automation assertion must include a target",
          });
        }
        if (
          testCase.automation.readiness === "ready" &&
          !assertion.expected.trim()
        ) {
          violations.push({
            id: `${assertion.id}:expected`,
            severity: "error",
            message: "Ready automation assertion must include expected result",
          });
        }
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
      if (
        testCase.automation.readiness === "blocked" &&
        testCase.automation.blockers.length === 0
      ) {
        violations.push({
          id: `${testCase.id}:blocker`,
          severity: "error",
          message: "Blocked automation case must include blocker reason",
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
  context: ArtifactConsistencyContext | GateViolation[] = {},
): GateResult {
  const testSpecCaseCount = spec.modules.reduce(
    (count, module) => count + module.cases.length,
    0,
  );
  const artifactViolations = Array.isArray(context)
    ? context
    : (context.hashViolations ?? []);
  const violations: GateViolation[] = [];
  if (xmind.caseCount !== testSpecCaseCount) {
    violations.push({
      id: "xmind-case-count",
      severity: "error",
      message: `XMind case count ${xmind.caseCount} does not match TestSpec case count ${testSpecCaseCount}`,
    });
  }
  if (!Array.isArray(context)) {
    for (const markdown of context.markdownArtifacts ?? []) {
      if (markdown.actual !== markdown.expected) {
        violations.push({
          id: markdown.id,
          severity: "error",
          message: `Markdown artifact is stale: ${markdown.path}`,
        });
      }
    }
  }
  violations.push(...artifactViolations);
  return {
    gateId: "artifact-consistency",
    passed: violations.every((violation) => violation.severity !== "error"),
    violations,
  };
}

export function checkRuleStoreCompliance(rules: HardRule[]): GateResult {
  const violations = rules
    .filter((rule) => rule.nonNegotiable && !rule.enabled)
    .map(
      (rule): GateViolation => ({
        id: rule.id,
        severity: "error",
        message: `Non-negotiable hard rule is disabled: ${rule.description}`,
      }),
    );
  return {
    gateId: "rule-store-compliance",
    passed: violations.length === 0,
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
  "rule-store-compliance": {
    id: "rule-store-compliance",
    checks: [checkRuleStoreCompliance],
  },
} as const;

function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
