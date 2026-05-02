import { describe, expect, test } from "bun:test";
import {
  SCHEMA_REGISTRY,
  validateSchema,
  type IssueDraft,
  type IssueSyncResult,
  type LanhuWritebackDraft,
  type LanhuWritebackResult,
  type NotificationRequest,
  type NotificationResult,
} from "../packages/domain/src/index";

describe("external collaboration contracts", () => {
  test("registers v0.4 collaboration schemas", () => {
    expect(SCHEMA_REGISTRY.IssueDraft).toBe("schemas/issue-draft.schema.json");
    expect(SCHEMA_REGISTRY.IssueSyncResult).toBe(
      "schemas/issue-sync-result.schema.json",
    );
    expect(SCHEMA_REGISTRY.LanhuWritebackDraft).toBe(
      "schemas/lanhu-writeback-draft.schema.json",
    );
    expect(SCHEMA_REGISTRY.LanhuWritebackResult).toBe(
      "schemas/lanhu-writeback-result.schema.json",
    );
  });

  test("validates notification request and result with purpose", () => {
    const request: NotificationRequest = {
      channel: "dingtalk",
      purpose: "confirmation",
      title: "需求澄清待确认: demo/rule-config",
      body: "请确认保存按钮文案。",
      sourceArtifactRef: "ConfirmationDraft:abc",
      atMobiles: ["13800000000"],
      dryRun: false,
    };
    const result: NotificationResult = {
      schemaVersion: "0.1",
      channel: "dingtalk",
      purpose: "confirmation",
      status: "sent",
      sent: true,
      messageId: "request-1",
      providerResponse: "ok",
      deliveredAt: "2026-05-02T00:00:00.000Z",
    };
    expect(validateSchema("NotificationRequest", request).valid).toBe(true);
    expect(validateSchema("NotificationResult", result).valid).toBe(true);
  });

  test("validates issue draft and Zentao sync result", () => {
    const draft: IssueDraft = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceBugReportRef: "BugReport:abc",
      sourceBugId: "BUG-001",
      title: "保存按钮点击无响应",
      severity: "P0",
      descriptionMarkdown: "## Actual\n按钮点击后无响应\n",
      reproductionSteps: ["打开规则配置页", "点击保存按钮"],
      evidenceRefs: ["EVID-SS-001"],
      labels: ["automation", "rule-config"],
      confirmedForSync: true,
    };
    const result: IssueSyncResult = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      tracker: "zentao",
      sourceIssueDraftRef: "IssueDraft:abc",
      status: "synced",
      remoteId: "ZT-1001",
      remoteUrl: "https://zentao.example/bug-view-1001.html",
      message: "created",
      syncedAt: "2026-05-02T00:00:00.000Z",
    };
    expect(validateSchema("IssueDraft", draft).valid).toBe(true);
    expect(validateSchema("IssueSyncResult", result).valid).toBe(true);
  });

  test("validates manually confirmed Lanhu writeback draft and result", () => {
    const draft: LanhuWritebackDraft = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRequirementSpecRef: "RequirementSpec:abc",
      targetUrl: "https://lanhu.example/prd/123",
      summaryMarkdown: "## 更新\n补充保存按钮文案为保存。\n",
      changeRefs: ["REQ-001"],
      confirmedForWriteback: true,
      confirmedBy: "product-owner",
      confirmedAt: "2026-05-02T00:00:00.000Z",
    };
    const result: LanhuWritebackResult = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      provider: "lanhu",
      targetUrl: "https://lanhu.example/prd/123",
      status: "written",
      message: "updated",
      writtenAt: "2026-05-02T00:00:00.000Z",
    };
    expect(validateSchema("LanhuWritebackDraft", draft).valid).toBe(true);
    expect(validateSchema("LanhuWritebackResult", result).valid).toBe(true);
  });
});
