import { describe, expect, test } from "bun:test";
import { validateSchema } from "../packages/domain/src/index";

describe("domain schema validator", () => {
  test("accepts valid workflow definitions", () => {
    const result = validateSchema("WorkflowDefinition", {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "create-feature-workspace", type: "artifact" }],
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("rejects invalid workflow node types", () => {
    const result = validateSchema("WorkflowDefinition", {
      id: "bad",
      version: "0.1.0",
      skill: "bad",
      nodes: [{ id: "branch", type: "branch" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "must be equal to one of the allowed values",
    );
  });

  test("rejects malformed RequirementSpec nested items", () => {
    const result = validateSchema("RequirementSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "Rule Config",
      status: "confirmed",
      rules: ["not-a-rule"],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/rules/0");
  });

  test("rejects invalid ConfirmationResult answer status", () => {
    const result = validateSchema("ConfirmationResult", {
      schemaVersion: "0.1",
      answers: [
        { questionId: "GAP-001", status: "accepted", answer: "保存" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/answers/0/status");
  });

  test("rejects RequirementSpec project path escapes", () => {
    const result = validateSchema("RequirementSpec", {
      schemaVersion: "0.1",
      project: "../outside",
      feature: "rule-config",
      title: "Rule Config",
      status: "confirmed",
      rules: [],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/project");
  });

  test("rejects malformed TestSpec nested items", () => {
    const result = validateSchema("TestSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "Rule Config Test Spec",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: ["not-a-module"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("/modules/0");
  });

  test("rejects UiScriptGenInput project, feature, and testSpecPath escapes", () => {
    expect(
      validateSchema("UiScriptGenInput", {
        schemaVersion: "0.1",
        project: "../outside",
        feature: "rule-config",
        testSpecPath: "test-spec/test-spec.json",
        mode: "mock",
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("UiScriptGenInput", {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rules/config",
        testSpecPath: "test-spec/test-spec.json",
        mode: "mock",
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("UiScriptGenInput", {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        testSpecPath: "../test-spec.json",
        mode: "mock",
      }).valid,
    ).toBe(false);
  });

  test("rejects RunRecord project, feature, and evidence path escapes", () => {
    const record = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "passed",
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:00:01.000Z",
      caseResults: [],
      evidenceFiles: ["automation/evidence/run-log.txt"],
    };

    expect(
      validateSchema("RunRecord", { ...record, project: "../outside" }).valid,
    ).toBe(false);
    expect(
      validateSchema("RunRecord", { ...record, feature: "rules/config" })
        .valid,
    ).toBe(false);
    expect(
      validateSchema("RunRecord", {
        ...record,
        evidenceFiles: ["automation/evidence/..\\secret.txt"],
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("RunRecord", {
        ...record,
        evidenceFiles: ["automation/evidence/../secret.txt"],
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("RunRecord", {
        ...record,
        evidenceFiles: ["automation/evidence/.hidden.txt"],
      }).valid,
    ).toBe(false);
  });

  test("rejects EvidencePack project, feature, path escapes, and short hash", () => {
    const evidence = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:test",
      evidence: [
        {
          id: "EVID-001",
          kind: "run-log",
          path: "automation/evidence/run-log.txt",
          hash:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      ],
    };

    expect(
      validateSchema("EvidencePack", { ...evidence, project: "../outside" })
        .valid,
    ).toBe(false);
    expect(
      validateSchema("EvidencePack", { ...evidence, feature: "rules/config" })
        .valid,
    ).toBe(false);
    expect(
      validateSchema("EvidencePack", {
        ...evidence,
        evidence: [
          { ...evidence.evidence[0], path: "automation/evidence/..\\secret.txt" },
        ],
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("EvidencePack", {
        ...evidence,
        evidence: [{ ...evidence.evidence[0], hash: "sha256:abc" }],
      }).valid,
    ).toBe(false);
  });

  test("rejects external collaboration path escapes and unconfirmed writeback", () => {
    expect(
      validateSchema("IssueDraft", {
        schemaVersion: "0.1",
        project: "../outside",
        feature: "rule-config",
        sourceBugReportRef: "BugReport:abc",
        sourceBugId: "BUG-001",
        title: "保存失败",
        severity: "P0",
        descriptionMarkdown: "failure",
        reproductionSteps: ["click save"],
        evidenceRefs: [],
        labels: [],
        confirmedForSync: true,
      }).valid,
    ).toBe(false);
    expect(
      validateSchema("LanhuWritebackDraft", {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rules/config",
        sourceRequirementSpecRef: "RequirementSpec:abc",
        targetUrl: "https://lanhu.example/prd/123",
        summaryMarkdown: "change",
        changeRefs: ["REQ-001"],
        confirmedForWriteback: true,
      }).valid,
    ).toBe(false);
  });
});
