# kata-agent v0.4 External Collaboration Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the v0.4 external collaboration plugin layer: real DingTalk delivery for human workflow outputs, Zentao issue sync from explicit `IssueDraft` artifacts, and guarded Lanhu write-back from manually approved drafts.

**Architecture:** Keep the Workflow Engine as the only flow controller. DingTalk replaces manual delivery of human-facing workflow output, but it never imports or approves `ConfirmationResult`; Zentao sync only consumes explicit `IssueDraft` artifacts; Lanhu write-back is isolated in a separate requirement-writeback plugin so the existing Lanhu requirement-source plugin stays read-only. All external side effects are schema-backed, manifest-declared, traceable, and opt-in through explicit CLI flags or draft artifacts.

**Tech Stack:** TypeScript, Bun workspaces, Bun test, Ajv JSON Schema validation, YAML manifests, existing Artifact Repository / Workflow Engine / Plugin Runtime contracts, Fetch API, DingTalk webhook signing via HMAC-SHA256.

---

## Scope Source

This plan implements the v0.4 roadmap slice from `docs/superpowers/plans/2026-05-01-kata-agent-v0.1-foundation.md`:

- DingTalk notification as human workflow output, not autonomous approval.
- Zentao issue sync from explicit `IssueDraft`.
- Optional Lanhu write-back only after manual confirmation.

It also resolves the relevant reserved extension points from `docs/superpowers/specs/2026-05-01-kata-agent-architecture-design.md` §22:

- DingTalk confirmation send support.
- Zentao bug creation/status sync foundation.
- Lanhu write-back as a guarded collaboration action.

Included:

- Extend `NotificationRequest` / `NotificationResult` so real delivery status is explicit.
- Add schema-backed `IssueDraft`, `IssueSyncResult`, `LanhuWritebackDraft`, and `LanhuWritebackResult`.
- Add a real DingTalk sender under the existing `notify` plugin.
- Add a `send-confirmation-notification` node before `await-confirmation-result`.
- Add an `IssueDraft` builder from `BugReport`.
- Add a `zentao` issue-tracker plugin with dry-run and real sync handlers.
- Add a separate `lanhu-writeback` plugin type/action so requirement source ingestion remains read-only.
- Add CLI commands for explicit issue draft creation, issue sync, Lanhu write-back draft creation, and Lanhu write-back execution.
- Add tests proving external plugins do not leak secrets, accept only explicit draft artifacts, and do not auto-import human confirmations.
- Add explicit runtime config initialization rules for mock, real, notification, issue sync, and write-back paths.

Excluded:

- DingTalk reply collection or conversion into `ConfirmationResult`.
- Autonomous issue creation directly from `BugReport`.
- Automatic Lanhu write-back from `RequirementSpec`.
- Mobile automation, desktop automation, full API automation.
- New workflow node types such as `branch`, `parallel`, `merge`, or `knowledge`.
- MCP servers, browser automation for admin consoles, and source-code repository mutation.

## File Structure

- Modify `packages/domain/src/notification.ts`
  - Add notification purpose, dry-run, delivery status, and provider response fields.
- Create `packages/domain/src/collaboration.ts`
  - Add `IssueDraft`, `IssueSyncResult`, `LanhuWritebackDraft`, and `LanhuWritebackResult`.
- Modify `packages/domain/src/index.ts`
  - Export collaboration contracts and extended notification contracts.
- Modify `packages/domain/src/schemas.ts`
  - Register the four new schemas.
- Create schemas:
  - `schemas/issue-draft.schema.json`
  - `schemas/issue-sync-result.schema.json`
  - `schemas/lanhu-writeback-draft.schema.json`
  - `schemas/lanhu-writeback-result.schema.json`
- Modify schemas:
  - `schemas/notification-request.schema.json`
  - `schemas/notification-result.schema.json`
  - `schemas/plugin-manifest.schema.json`
- Modify `packages/plugin-runtime/src/types.ts`
  - Add `requirement-writeback` plugin type.
- Modify `packages/plugin-runtime/src/constraints.ts`
  - Allow `IssueSyncResult` for `issue-tracker` and `LanhuWritebackResult` for `requirement-writeback`.
- Modify `plugins/notify/plugin.yaml`
  - Declare restricted network and DingTalk secrets.
- Modify `plugins/notify/src/mock.ts`
  - Return the extended `NotificationResult`.
- Modify existing plugin source imports
  - `plugins/lanhu/src/mock.ts`
  - `plugins/lanhu/src/real.ts`
  - `plugins/xmind/src/mock.ts`
  - `plugins/xmind/src/exporter.ts`
  - `plugins/report/src/allure.ts`
  - `plugins/report/src/html-renderer.ts`
  - `plugins/playwright/src/mock.ts`
  - `plugins/notify/src/mock.ts`
  - Use `@kata-agent/domain` for domain contracts instead of relative package traversal.
- Create `plugins/notify/src/dingtalk.ts`
  - Real DingTalk webhook sender and signing helpers.
- Create `plugins/zentao/package.json`
- Create `plugins/zentao/plugin.yaml`
- Create `plugins/zentao/src/mock.ts`
- Create `plugins/zentao/src/real.ts`
- Create `plugins/lanhu-writeback/package.json`
- Create `plugins/lanhu-writeback/plugin.yaml`
- Create `plugins/lanhu-writeback/src/mock.ts`
- Create `plugins/lanhu-writeback/src/real.ts`
- Create `packages/workflow-engine/src/collaboration-builders.ts`
  - Build `IssueDraft[]` from `BugReport`.
  - Build `LanhuWritebackDraft` from `RequirementSpec`.
- Modify `packages/workflow-engine/src/artifact-builders.ts`
  - Export collaboration builders.
- Modify `packages/workflow-engine/src/index.ts`
  - Export collaboration builders.
- Modify `packages/workflow-engine/src/executor.ts`
  - Add `send-confirmation-notification` node handling.
- Modify `packages/workflow-engine/src/runtime-factory.ts`
  - Add `notifyMode`, initialize `LocalConfigLoader` consistently, register real DingTalk only when requested, and register external plugin actions.
- Modify `workflows/test-case-gen.yaml`
  - Insert `send-confirmation-notification` before `await-confirmation-result`.
- Modify `apps/cli/src/index.ts`
  - Add `--notify mock|real|off`.
  - Add `issue draft`, `issue sync`, `lanhu writeback-draft`, and `lanhu writeback` commands.
- Modify `README.md`
  - Document v0.4 environment variables and commands.
- Modify tests:
  - `tests/domain.contracts.test.ts`
  - `tests/domain.validator.test.ts`
  - `tests/manifest-references.test.ts`
  - `tests/plugin-runtime.test.ts`
  - `tests/runtime-loop.test.ts`
- Create tests:
  - `tests/external-collaboration.contracts.test.ts`
  - `tests/dingtalk-notify-plugin.test.ts`
  - `tests/confirmation-notification.workflow.test.ts`
  - `tests/issue-draft-builder.test.ts`
  - `tests/zentao-plugin.test.ts`
  - `tests/issue-cli.test.ts`
  - `tests/lanhu-writeback-plugin.test.ts`
  - `tests/lanhu-writeback-cli.test.ts`

## Hard Constraints

- Keep `WorkflowExecutor` as the only workflow flow controller.
- Keep workflow node types exactly: `tool`, `agent`, `gate`, `human`, `artifact`.
- DingTalk delivery must never create, approve, or import `ConfirmationResult`.
- Zentao sync must consume `IssueDraft`; it must not consume `BugReport` directly.
- Lanhu write-back must consume `LanhuWritebackDraft` with `confirmedForWriteback: true` unless the CLI/plugin call explicitly passes `--dry-run`.
- Lanhu trusted write-back hosts must be injected from configuration (`LANHU_WRITEBACK_ALLOWED_HOSTS`); plugin code must not hardcode trusted domains.
- Plugin implementation files under `plugins/*/src/*.ts` must import domain contracts from `@kata-agent/domain`, not by relative path traversal into `packages/domain`.
- `IssueSyncResult.sourceIssueDraftRef` must come from the plugin input object; runtime registration and plugin handlers must not hardcode placeholder refs.
- Keep the existing `plugins/lanhu` requirement-source plugin read-only.
- Do not hardcode absolute paths.
- Do not hardcode credentials, cookies, tokens, DingTalk URLs, Zentao URLs, or internal service URLs.
- File tests must use temp dirs and clean them up.
- External plugin tests must mock `fetch`; unit tests must not call DingTalk, Zentao, or Lanhu.
- Plugin manifests must reference schemas from `SCHEMA_REGISTRY`.
- Plugin actions must declare side effects and required secrets in `plugin.yaml`.

---

## Task 0: Collaboration Domain Contracts

**Objective:** Add schema-backed contracts for external collaboration artifacts and tighten notification delivery state.

**Files:**

- Modify: `packages/domain/src/notification.ts`
- Create: `packages/domain/src/collaboration.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/schemas.ts`
- Create: `schemas/issue-draft.schema.json`
- Create: `schemas/issue-sync-result.schema.json`
- Create: `schemas/lanhu-writeback-draft.schema.json`
- Create: `schemas/lanhu-writeback-result.schema.json`
- Modify: `schemas/notification-request.schema.json`
- Modify: `schemas/notification-result.schema.json`
- Create: `tests/external-collaboration.contracts.test.ts`
- Modify: `tests/domain.contracts.test.ts`
- Modify: `tests/domain.validator.test.ts`

- [ ] **Step 1: Write failing collaboration contract tests**

Create `tests/external-collaboration.contracts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
bun test tests/external-collaboration.contracts.test.ts
```

Expected: FAIL because `IssueDraft`, `IssueSyncResult`, `LanhuWritebackDraft`, and `LanhuWritebackResult` are not exported or registered.

- [ ] **Step 3: Extend notification domain types**

Replace `packages/domain/src/notification.ts` with:

```ts
export type NotificationPurpose =
  | "confirmation"
  | "automation-result"
  | "issue-sync"
  | "lanhu-writeback";

export type NotificationDeliveryStatus = "dry-run" | "sent" | "failed" | "skipped";

export interface NotificationRequest {
  channel: "dingtalk";
  purpose: NotificationPurpose;
  title: string;
  body: string;
  sourceArtifactRef?: string;
  atMobiles?: string[];
  dryRun?: boolean;
}

export interface NotificationResult {
  schemaVersion: "0.1";
  channel: "dingtalk";
  purpose: NotificationPurpose;
  status: NotificationDeliveryStatus;
  sent: boolean;
  messageId?: string;
  providerResponse?: string;
  deliveredAt: string;
}
```

- [ ] **Step 4: Add collaboration domain types**

Create `packages/domain/src/collaboration.ts`:

```ts
export type ExternalSeverity = "P0" | "P1" | "P2";
export type IssueSyncStatus = "dry-run" | "synced" | "failed" | "skipped";
export type LanhuWritebackStatus = "dry-run" | "written" | "failed" | "skipped";

export interface IssueDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceBugReportRef: string;
  sourceBugId: string;
  title: string;
  severity: ExternalSeverity;
  descriptionMarkdown: string;
  reproductionSteps: string[];
  evidenceRefs: string[];
  labels: string[];
  assignee?: string;
  confirmedForSync: boolean;
  sourceIssueDraftRef?: string;
}

export interface IssueSyncResult {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  tracker: "zentao";
  sourceIssueDraftRef: string;
  status: IssueSyncStatus;
  remoteId?: string;
  remoteUrl?: string;
  message: string;
  syncedAt: string;
}

export interface LanhuWritebackDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceRequirementSpecRef: string;
  targetUrl: string;
  summaryMarkdown: string;
  changeRefs: string[];
  confirmedForWriteback: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface LanhuWritebackResult {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  provider: "lanhu";
  targetUrl: string;
  status: LanhuWritebackStatus;
  remoteUrl?: string;
  message: string;
  writtenAt: string;
}
```

- [ ] **Step 5: Export and register contracts**

Add to `packages/domain/src/index.ts`:

```ts
export type {
  ExternalSeverity,
  IssueDraft,
  IssueSyncResult,
  IssueSyncStatus,
  LanhuWritebackDraft,
  LanhuWritebackResult,
  LanhuWritebackStatus,
} from "./collaboration";
export type {
  NotificationDeliveryStatus,
  NotificationPurpose,
  NotificationRequest,
  NotificationResult,
} from "./notification";
```

Remove the old one-line notification export so each notification type is exported once.

Add these entries to `SCHEMA_REGISTRY` in `packages/domain/src/schemas.ts` after `NotificationResult`:

```ts
  IssueDraft: "schemas/issue-draft.schema.json",
  IssueSyncResult: "schemas/issue-sync-result.schema.json",
  LanhuWritebackDraft: "schemas/lanhu-writeback-draft.schema.json",
  LanhuWritebackResult: "schemas/lanhu-writeback-result.schema.json",
```

- [ ] **Step 6: Add JSON schemas**

Create `schemas/issue-draft.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/issue-draft.schema.json",
  "title": "IssueDraft",
  "type": "object",
  "required": [
    "schemaVersion",
    "project",
    "feature",
    "sourceBugReportRef",
    "sourceBugId",
    "title",
    "severity",
    "descriptionMarkdown",
    "reproductionSteps",
    "evidenceRefs",
    "labels",
    "confirmedForSync"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "feature": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "sourceBugReportRef": { "type": "string", "minLength": 1 },
    "sourceBugId": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "severity": { "type": "string", "enum": ["P0", "P1", "P2"] },
    "descriptionMarkdown": { "type": "string", "minLength": 1 },
    "reproductionSteps": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "evidenceRefs": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "labels": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "assignee": { "type": "string", "minLength": 1 },
    "confirmedForSync": { "type": "boolean" },
    "sourceIssueDraftRef": { "type": "string", "minLength": 1 }
  },
  "additionalProperties": false
}
```

Create `schemas/issue-sync-result.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/issue-sync-result.schema.json",
  "title": "IssueSyncResult",
  "type": "object",
  "required": [
    "schemaVersion",
    "project",
    "feature",
    "tracker",
    "sourceIssueDraftRef",
    "status",
    "message",
    "syncedAt"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "feature": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "tracker": { "type": "string", "enum": ["zentao"] },
    "sourceIssueDraftRef": { "type": "string", "minLength": 1 },
    "status": {
      "type": "string",
      "enum": ["dry-run", "synced", "failed", "skipped"]
    },
    "remoteId": { "type": "string", "minLength": 1 },
    "remoteUrl": { "type": "string", "format": "uri" },
    "message": { "type": "string" },
    "syncedAt": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

Create `schemas/lanhu-writeback-draft.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/lanhu-writeback-draft.schema.json",
  "title": "LanhuWritebackDraft",
  "type": "object",
  "required": [
    "schemaVersion",
    "project",
    "feature",
    "sourceRequirementSpecRef",
    "targetUrl",
    "summaryMarkdown",
    "changeRefs",
    "confirmedForWriteback"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "feature": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "sourceRequirementSpecRef": { "type": "string", "minLength": 1 },
    "targetUrl": { "type": "string", "format": "uri" },
    "summaryMarkdown": { "type": "string", "minLength": 1 },
    "changeRefs": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "confirmedForWriteback": { "type": "boolean" },
    "confirmedBy": { "type": "string", "minLength": 1 },
    "confirmedAt": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

Create `schemas/lanhu-writeback-result.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/lanhu-writeback-result.schema.json",
  "title": "LanhuWritebackResult",
  "type": "object",
  "required": [
    "schemaVersion",
    "project",
    "feature",
    "provider",
    "targetUrl",
    "status",
    "message",
    "writtenAt"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "feature": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "[/\\\\]|^\\.$|^\\.\\.$|^[A-Za-z]:" }
    },
    "provider": { "type": "string", "enum": ["lanhu"] },
    "targetUrl": { "type": "string", "format": "uri" },
    "status": {
      "type": "string",
      "enum": ["dry-run", "written", "failed", "skipped"]
    },
    "remoteUrl": { "type": "string", "format": "uri" },
    "message": { "type": "string" },
    "writtenAt": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

Replace `schemas/notification-request.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/notification-request.schema.json",
  "title": "NotificationRequest",
  "type": "object",
  "required": ["channel", "purpose", "title", "body"],
  "properties": {
    "channel": { "type": "string", "enum": ["dingtalk"] },
    "purpose": {
      "type": "string",
      "enum": ["confirmation", "automation-result", "issue-sync", "lanhu-writeback"]
    },
    "title": { "type": "string", "minLength": 1 },
    "body": { "type": "string", "minLength": 1 },
    "sourceArtifactRef": { "type": "string", "minLength": 1 },
    "atMobiles": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[0-9+ -]{6,24}$" }
    },
    "dryRun": { "type": "boolean" }
  },
  "additionalProperties": false
}
```

Replace `schemas/notification-result.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/notification-result.schema.json",
  "title": "NotificationResult",
  "type": "object",
  "required": [
    "schemaVersion",
    "channel",
    "purpose",
    "status",
    "sent",
    "deliveredAt"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "channel": { "type": "string", "enum": ["dingtalk"] },
    "purpose": {
      "type": "string",
      "enum": ["confirmation", "automation-result", "issue-sync", "lanhu-writeback"]
    },
    "status": {
      "type": "string",
      "enum": ["dry-run", "sent", "failed", "skipped"]
    },
    "sent": { "type": "boolean" },
    "messageId": { "type": "string" },
    "providerResponse": { "type": "string" },
    "deliveredAt": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

- [ ] **Step 7: Update domain enum tests**

In `tests/domain.contracts.test.ts`, extend the plugin type expected enum later in Task 4 after `requirement-writeback` exists. Add these enum checks now:

```ts
    expectEnum("NotificationRequest", ["properties", "purpose"], [
      "confirmation",
      "automation-result",
      "issue-sync",
      "lanhu-writeback",
    ]);
    expectEnum("NotificationResult", ["properties", "status"], [
      "dry-run",
      "sent",
      "failed",
      "skipped",
    ]);
    expectEnum("IssueDraft", ["properties", "severity"], ["P0", "P1", "P2"]);
    expectEnum("IssueSyncResult", ["properties", "status"], [
      "dry-run",
      "synced",
      "failed",
      "skipped",
    ]);
    expectEnum("LanhuWritebackResult", ["properties", "status"], [
      "dry-run",
      "written",
      "failed",
      "skipped",
    ]);
```

Add this validator test to `tests/domain.validator.test.ts`:

```ts
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
```

- [ ] **Step 8: Run tests**

Run:

```bash
bun test tests/external-collaboration.contracts.test.ts tests/domain.contracts.test.ts tests/domain.validator.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/notification.ts packages/domain/src/collaboration.ts packages/domain/src/index.ts packages/domain/src/schemas.ts schemas/*notification*.json schemas/issue-draft.schema.json schemas/issue-sync-result.schema.json schemas/lanhu-writeback-draft.schema.json schemas/lanhu-writeback-result.schema.json tests/external-collaboration.contracts.test.ts tests/domain.contracts.test.ts tests/domain.validator.test.ts
git commit -m "feat: add external collaboration domain contracts"
```

---

## Task 0A: Plugin Workspace Import Hygiene

**Objective:** Convert all existing plugin implementation files that import domain contracts through relative package traversal to `@kata-agent/domain` before adding new v0.4 plugin files.

**Files:**

- Modify: `plugins/lanhu/src/mock.ts`
- Modify: `plugins/lanhu/src/real.ts`
- Modify: `plugins/xmind/src/mock.ts`
- Modify: `plugins/xmind/src/exporter.ts`
- Modify: `plugins/report/src/allure.ts`
- Modify: `plugins/report/src/html-renderer.ts`
- Modify: `plugins/playwright/src/mock.ts`
- Modify: `plugins/notify/src/mock.ts`

- [ ] **Step 1: Run import scan to verify RED**

Run:

```bash
rg -n 'from "../../../packages/domain/src/index"' plugins
```

Expected: FAIL with hits in current plugin implementation files, including:

```text
plugins/lanhu/src/mock.ts
plugins/lanhu/src/real.ts
plugins/xmind/src/mock.ts
plugins/xmind/src/exporter.ts
plugins/report/src/allure.ts
plugins/report/src/html-renderer.ts
plugins/playwright/src/mock.ts
plugins/notify/src/mock.ts
```

- [ ] **Step 2: Replace Lanhu plugin domain imports**

In `plugins/lanhu/src/mock.ts` and `plugins/lanhu/src/real.ts`, replace:

```ts
import type {
  LanhuFetchInput,
  RequirementSourceBundle,
} from "../../../packages/domain/src/index";
```

with:

```ts
import type {
  LanhuFetchInput,
  RequirementSourceBundle,
} from "@kata-agent/domain";
```

- [ ] **Step 3: Replace XMind plugin domain imports**

In `plugins/xmind/src/mock.ts` and `plugins/xmind/src/exporter.ts`, replace:

```ts
import type { TestSpec, XMindExport } from "../../../packages/domain/src/index";
```

with:

```ts
import type { TestSpec, XMindExport } from "@kata-agent/domain";
```

- [ ] **Step 4: Replace report plugin domain imports**

In `plugins/report/src/allure.ts` and `plugins/report/src/html-renderer.ts`, replace:

```ts
import type { HtmlReport, RunRecord } from "../../../packages/domain/src/index";
```

with:

```ts
import type { HtmlReport, RunRecord } from "@kata-agent/domain";
```

- [ ] **Step 5: Replace Playwright and notify plugin domain imports**

In `plugins/playwright/src/mock.ts`, replace:

```ts
import type { RunPlan, RunRecord } from "../../../packages/domain/src/index";
```

with:

```ts
import type { RunPlan, RunRecord } from "@kata-agent/domain";
```

In `plugins/notify/src/mock.ts`, replace:

```ts
import type {
  NotificationRequest,
  NotificationResult,
} from "../../../packages/domain/src/index";
```

with:

```ts
import type {
  NotificationRequest,
  NotificationResult,
} from "@kata-agent/domain";
```

- [ ] **Step 6: Run import scan and typecheck**

Run:

```bash
rg -n 'from "../../../packages/domain/src/index"' plugins
bun run typecheck
```

Expected: first command has no output and exits 1; `bun run typecheck` exits 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/lanhu/src/mock.ts plugins/lanhu/src/real.ts plugins/xmind/src/mock.ts plugins/xmind/src/exporter.ts plugins/report/src/allure.ts plugins/report/src/html-renderer.ts plugins/playwright/src/mock.ts plugins/notify/src/mock.ts
git commit -m "chore: use workspace domain imports in plugins"
```

---

## Task 1: Real DingTalk Notification Plugin

**Objective:** Replace the v0.3 notify mock-only behavior with a real DingTalk webhook sender that supports dry-run, signing, secret-safe output, and mocked tests.

**Files:**

- Modify: `plugins/notify/plugin.yaml`
- Modify: `plugins/notify/src/mock.ts`
- Create: `plugins/notify/src/dingtalk.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `tests/notify-plugin.test.ts`
- Create: `tests/dingtalk-notify-plugin.test.ts`

- [ ] **Step 1: Write failing DingTalk tests**

Create `tests/dingtalk-notify-plugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildDingTalkPayload,
  sendDingTalkNotification,
  signedDingTalkUrl,
} from "../plugins/notify/src/dingtalk";

describe("real DingTalk notify plugin", () => {
  test("builds markdown payload without leaking webhook secret", () => {
    const payload = buildDingTalkPayload({
      channel: "dingtalk",
      purpose: "confirmation",
      title: "需求澄清待确认",
      body: "请确认保存按钮文案。",
      atMobiles: ["13800000000"],
    });
    expect(payload.msgtype).toBe("markdown");
    expect(payload.markdown.title).toBe("需求澄清待确认");
    expect(payload.markdown.text).toContain("请确认保存按钮文案");
    expect(payload.at.atMobiles).toEqual(["13800000000"]);
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  test("adds DingTalk signature query parameters", () => {
    const url = signedDingTalkUrl(
      "https://oapi.dingtalk.com/robot/send?access_token=token",
      "secret",
      1777600000000,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("timestamp")).toBe("1777600000000");
    expect(parsed.searchParams.get("sign")).toBeTruthy();
    expect(parsed.toString()).not.toContain("secret");
  });

  test("posts signed webhook and returns schema-safe result", async () => {
    let calledUrl = "";
    let authHeader = "";
    const result = await sendDingTalkNotification(
      {
        channel: "dingtalk",
        purpose: "confirmation",
        title: "需求澄清待确认",
        body: "请确认保存按钮文案。",
        sourceArtifactRef: "ConfirmationDraft:abc",
      },
      {
        webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=token",
        secret: "secret",
        now: () => 1777600000000,
        fetchImpl: async (url, init) => {
          calledUrl = String(url);
          authHeader = String((init?.headers as Record<string, string>)["content-type"]);
          expect(init?.method).toBe("POST");
          expect(String(init?.body)).toContain("需求澄清待确认");
          return Response.json({ errcode: 0, errmsg: "ok", requestId: "req-1" });
        },
      },
    );
    expect(calledUrl).toContain("timestamp=1777600000000");
    expect(calledUrl).toContain("sign=");
    expect(calledUrl).not.toContain("secret");
    expect(authHeader).toBe("application/json");
    expect(result.status).toBe("sent");
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe("req-1");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("dry-run skips network", async () => {
    let called = false;
    const result = await sendDingTalkNotification(
      {
        channel: "dingtalk",
        purpose: "automation-result",
        title: "Automation passed",
        body: "Run completed",
        dryRun: true,
      },
      {
        webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=token",
        fetchImpl: async () => {
          called = true;
          return Response.json({ errcode: 0 });
        },
      },
    );
    expect(called).toBe(false);
    expect(result.status).toBe("dry-run");
    expect(result.sent).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
bun test tests/dingtalk-notify-plugin.test.ts
```

Expected: FAIL because `plugins/notify/src/dingtalk.ts` does not exist.

- [ ] **Step 3: Implement DingTalk sender**

Create `plugins/notify/src/dingtalk.ts`:

```ts
import { createHmac } from "node:crypto";
import type {
  NotificationRequest,
  NotificationResult,
} from "@kata-agent/domain";

export interface DingTalkOptions {
  webhookUrl?: string;
  secret?: string;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  now?: () => number;
}

export interface DingTalkMarkdownPayload {
  msgtype: "markdown";
  markdown: {
    title: string;
    text: string;
  };
  at: {
    atMobiles: string[];
    isAtAll: false;
  };
}

export function buildDingTalkPayload(
  input: NotificationRequest,
): DingTalkMarkdownPayload {
  return {
    msgtype: "markdown",
    markdown: {
      title: input.title,
      text: `## ${input.title}\n\n${input.body}`,
    },
    at: {
      atMobiles: input.atMobiles ?? [],
      isAtAll: false,
    },
  };
}

export function signedDingTalkUrl(
  webhookUrl: string,
  secret: string | undefined,
  timestamp: number,
): string {
  if (!secret) return webhookUrl;
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(
    createHmac("sha256", secret).update(stringToSign).digest("base64"),
  );
  const url = new URL(webhookUrl);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  return url.toString();
}

export async function sendDingTalkNotification(
  input: NotificationRequest,
  options: DingTalkOptions,
): Promise<NotificationResult> {
  const deliveredAt = new Date().toISOString();
  if (input.dryRun) {
    return {
      schemaVersion: "0.1",
      channel: "dingtalk",
      purpose: input.purpose,
      status: "dry-run",
      sent: false,
      providerResponse: "dry-run",
      deliveredAt,
    };
  }
  if (!options.webhookUrl) {
    throw new Error("MISSING_SECRET DINGTALK_WEBHOOK_URL");
  }

  const timestamp = options.now?.() ?? Date.now();
  const url = signedDingTalkUrl(options.webhookUrl, options.secret, timestamp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDingTalkPayload(input)),
  });
  const body = (await response.json().catch(() => ({}))) as {
    errcode?: number;
    errmsg?: string;
    requestId?: string;
  };
  if (!response.ok || body.errcode !== 0) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT DingTalk ${response.status} ${body.errmsg ?? "unknown"}`,
    );
  }
  return {
    schemaVersion: "0.1",
    channel: "dingtalk",
    purpose: input.purpose,
    status: "sent",
    sent: true,
    messageId: body.requestId,
    providerResponse: body.errmsg ?? "ok",
    deliveredAt,
  };
}
```

- [ ] **Step 4: Update notify mock**

Replace `plugins/notify/src/mock.ts` with:

```ts
import type {
  NotificationRequest,
  NotificationResult,
} from "@kata-agent/domain";

export async function sendNotification(
  params: NotificationRequest,
): Promise<NotificationResult> {
  return {
    schemaVersion: "0.1",
    channel: params.channel,
    purpose: params.purpose,
    status: params.dryRun ? "dry-run" : "sent",
    sent: params.dryRun ? false : true,
    messageId: params.dryRun ? undefined : "mock-notification",
    providerResponse: params.dryRun ? "dry-run" : "mock sent",
    deliveredAt: new Date().toISOString(),
  };
}
```

Update `tests/notify-plugin.test.ts` request:

```ts
    const result = await sendNotification({
      channel: "dingtalk",
      purpose: "automation-result",
      title: "Test Run",
      body: "All passed",
    });
```

- [ ] **Step 5: Update notify manifest**

Replace `plugins/notify/plugin.yaml`:

```yaml
name: notify
title: 通知
version: 0.4.0
type: notification
actions:
  - id: notify.sendNotification
    title: 发送 DingTalk 通知
    inputSchema: NotificationRequest
    outputSchema: NotificationResult
    sideEffects:
      network: true
      external: true
permissions:
  network: restricted
  secrets:
    - DINGTALK_WEBHOOK_URL
    - DINGTALK_SECRET
  writeScopes: []
```

- [ ] **Step 6: Add notify mode to runtime factory and CLI**

In `packages/workflow-engine/src/runtime-factory.ts`, import the real sender:

```ts
import { sendDingTalkNotification } from "../../../plugins/notify/src/dingtalk";
```

Extend `RuntimeFactoryOptions`:

```ts
export interface RuntimeFactoryOptions {
  rootDir: string;
  mode: "mock" | "real";
  browserType?: PlaywrightRealOptions["browserType"];
  requireProviderConfig?: boolean;
  notifyMode?: "mock" | "real" | "off";
}
```

Initialize config at the top of `createRuntimeServices`, before the mock/real branch, so external plugin modes have one consistent secret source:

```ts
  const config = new LocalConfigLoader({ rootDir: options.rootDir });
  const browserType = options.browserType ?? "chromium";
  const notifyMode = options.notifyMode ?? "mock";
  const requireProviderConfig =
    options.requireProviderConfig ?? options.mode === "real";
```

Mode rules:

- `mode: "mock"` still creates `LocalConfigLoader`, but provider secrets are not required.
- `mode: "real"` requires provider config only when `requireProviderConfig` resolves to `true`.
- `notifyMode: "mock"` uses `plugins/notify/src/mock.ts` and reads no DingTalk secrets.
- `notifyMode: "off"` registers a dry-run notification action and reads no DingTalk secrets.
- `notifyMode: "real"` resolves `DINGTALK_WEBHOOK_URL` and `DINGTALK_SECRET` from the shared config object regardless of provider mode.
- CLI-only `issue sync` and `lanhu writeback` commands create their own `LocalConfigLoader({ rootDir: location.rootDir })` after `parseFeatureDir()`.

Remove the old real-branch-local declarations:

```ts
    const config = new LocalConfigLoader({ rootDir: options.rootDir });
    const requireProviderConfig = options.requireProviderConfig ?? true;
```

Use the top-level variables inside the real branch:

```ts
    const baseUrl = config.resolveSecret("KATA_AGENT_PROVIDER_BASE_URL");
    const apiKey = config.resolveSecret("KATA_AGENT_PROVIDER_API_KEY");
    const model = config.resolveSecret("KATA_AGENT_PROVIDER_MODEL");
    if (baseUrl && apiKey && model) {
      providers.register(
        new OpenAICompatibleProvider({
          id: "openai-compatible",
          baseUrl,
          apiKey,
          model,
        }),
      );
    } else if (requireProviderConfig) {
      throw new Error("MISSING_SECRET provider config");
    }
```

Add this helper inside `createRuntimeServices` after the top-level config constants:

```ts
  const registerNotifyAction = () => {
    if (notifyMode === "off") {
      actions.register("notify.sendNotification", (input) =>
        sendNotification({
          ...(input as NotificationRequest),
          dryRun: true,
        }),
      );
      return;
    }
    if (notifyMode === "real") {
      actions.register("notify.sendNotification", (input) =>
        sendDingTalkNotification(input as NotificationRequest, {
          webhookUrl: config.resolveSecret("DINGTALK_WEBHOOK_URL"),
          secret: config.resolveSecret("DINGTALK_SECRET"),
        }),
      );
      return;
    }
    actions.register("notify.sendNotification", (input) =>
      sendNotification(input as NotificationRequest),
    );
  };
```

Replace both existing `actions.register("notify.sendNotification", ...)` blocks with:

```ts
    registerNotifyAction();
```

in both mock mode and real mode.

In `apps/cli/src/index.ts`, add:

```ts
function notifyMode(): RuntimeFactoryOptions["notifyMode"] {
  const value = argValue("--notify") ?? "mock";
  if (value !== "mock" && value !== "real" && value !== "off") {
    console.error(`Invalid --notify: ${value}. Expected "mock", "real", or "off".`);
    process.exit(1);
  }
  return value;
}
```

Pass `notifyMode: notifyMode()` into `createRuntimeServices` for `test-case-gen`, `ui-script-gen`, and `workflow resume`.

- [ ] **Step 7: Run tests**

Run:

```bash
bun test tests/notify-plugin.test.ts tests/dingtalk-notify-plugin.test.ts tests/runtime-factory.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/notify/plugin.yaml plugins/notify/src/mock.ts plugins/notify/src/dingtalk.ts packages/workflow-engine/src/runtime-factory.ts apps/cli/src/index.ts tests/notify-plugin.test.ts tests/dingtalk-notify-plugin.test.ts tests/runtime-factory.test.ts
git commit -m "feat: add real DingTalk notification plugin"
```

---

## Task 2: DingTalk Human Workflow Output

**Objective:** Send the rendered confirmation draft through the notify plugin before the human node waits, while keeping manual `confirmation import` as the only source of `ConfirmationResult`.

**Files:**

- Modify: `workflows/test-case-gen.yaml`
- Modify: `packages/workflow-engine/src/executor.ts`
- Create: `tests/confirmation-notification.workflow.test.ts`
- Modify: `tests/manifest-references.test.ts`
- Modify: `tests/runtime-loop.test.ts`

- [ ] **Step 1: Write failing workflow test**

Create `tests/confirmation-notification.workflow.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import { featureDir } from "../packages/artifact-repo/src/index";
import { createRuntimeServices, type WorkflowDefinition } from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function loadWorkflow(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(import.meta.dir, "..", "workflows", "test-case-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

describe("confirmation notification workflow", () => {
  test("sends confirmation notification before waiting for manual import", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-notify-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const { executor } = createRuntimeServices({
      rootDir,
      mode: "mock",
      notifyMode: "mock",
    });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "run-confirmation-notify",
      sourceUrl: "mock://poor-prd",
    });

    const dir = featureDir(location);
    expect(result.state.status).toBe("waiting");
    expect(result.state.currentNode).toBe("await-confirmation-result");
    expect(existsSync(join(dir, "requirement/clarifications/confirmation-draft.md"))).toBe(true);
    expect(existsSync(join(dir, "requirement/clarifications/confirmation-notification-result.json"))).toBe(true);
    expect(existsSync(join(dir, "requirement/confirmed/confirmation-result.json"))).toBe(false);

    const notification = JSON.parse(
      readFileSync(
        join(dir, "requirement/clarifications/confirmation-notification-result.json"),
        "utf8",
      ),
    ) as { purpose: string; status: string };
    expect(notification.purpose).toBe("confirmation");
    expect(notification.status).toBe("sent");

    const trace = readFileSync(join(dir, "traces/run-confirmation-notify.jsonl"), "utf8");
    expect(trace).toContain('"nodeId":"send-confirmation-notification"');
    expect(trace).toContain('"nodeId":"await-confirmation-result"');
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
bun test tests/confirmation-notification.workflow.test.ts
```

Expected: FAIL because the workflow node and executor case do not exist.

- [ ] **Step 3: Insert workflow node**

Modify `workflows/test-case-gen.yaml` so the confirmation section becomes:

```yaml
  - id: render-confirmation-draft
    type: artifact
    dependsOn: [draft-clarification-dossier]
  - id: send-confirmation-notification
    type: tool
    action: notify.sendNotification
    dependsOn: [render-confirmation-draft]
  - id: await-confirmation-result
    type: human
    dependsOn: [send-confirmation-notification]
```

- [ ] **Step 4: Implement executor case**

In `packages/workflow-engine/src/executor.ts`, add `readArtifactVerified` to the artifact-repo import:

```ts
  readArtifactVerified,
```

Use the existing `render-confirmation-draft` switch case as the anchor:

```ts
          case "render-confirmation-draft": {
            const rendered = renderConfirmationDraft(
              refFor("ClarificationDossier"),
              valueFor<ClarificationDossier>("ClarificationDossier"),
            );
            writtenRefs.push(
              writeJson(
                "ConfirmationDraft",
                "requirement/clarifications/confirmation-draft.json",
                rendered.draft,
                ["feature.requirement.clarif"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "ConfirmationDraftMarkdown",
                  "requirement/clarifications/confirmation-draft.md",
                  rendered.markdown,
                  "workflow-executor",
                  { allowedScopes: ["feature.requirement.clarif"] },
                ),
              ),
            );
            break;
          }
```

Add this `switch` case immediately after `render-confirmation-draft`:

```ts
          case "send-confirmation-notification": {
            if (!node.action) {
              throw new Error("Missing action: send-confirmation-notification");
            }
            const draftRef = refFor("ConfirmationDraft");
            const markdownRef = readArtifactIndex(context.location).artifacts.find(
              (item) => item.type === "ConfirmationDraftMarkdown",
            );
            const markdown = markdownRef
              ? readArtifactVerified(context.location, markdownRef)
              : `Confirmation draft: ${valueFor<ConfirmationDraft>("ConfirmationDraft").renderedMarkdownPath}`;
            const output = (await this.services.actions.execute(
              node.action,
              {
                channel: "dingtalk",
                purpose: "confirmation",
                title: `需求澄清待确认: ${context.location.project}/${context.location.feature}`,
                body: markdown,
                sourceArtifactRef: draftRef.id,
              },
              actionContext,
            )) as NotificationResult;
            writtenRefs.push(
              writeJson(
                "NotificationResult",
                "requirement/clarifications/confirmation-notification-result.json",
                output,
                ["feature.requirement.clarif"],
              ),
            );
            break;
          }
```

This case writes only `NotificationResult`. It does not write `ConfirmationResult` and does not mark the human node as succeeded.

- [ ] **Step 5: Update manifest tests**

In `tests/manifest-references.test.ts`, update the expected `test-case-gen` workflow node list if the file has an explicit list. If it only checks resolvability, no change is needed.

In `tests/runtime-loop.test.ts`, add this artifact to the existing post-start assertions before confirmation import:

```ts
    expect(
      existsSync(
        join(
          dir,
          "requirement",
          "clarifications",
          "confirmation-notification-result.json",
        ),
      ),
    ).toBe(true);
```

- [ ] **Step 6: Run tests**

Run:

```bash
bun test tests/confirmation-notification.workflow.test.ts tests/runtime-loop.test.ts tests/manifest-references.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add workflows/test-case-gen.yaml packages/workflow-engine/src/executor.ts tests/confirmation-notification.workflow.test.ts tests/runtime-loop.test.ts tests/manifest-references.test.ts
git commit -m "feat: send confirmation drafts through notification workflow"
```

---

## Task 3: IssueDraft Builder and CLI Draft Command

**Objective:** Convert `BugReport` into explicit `IssueDraft` artifacts that humans can review before any external issue tracker write.

**Files:**

- Create: `packages/workflow-engine/src/collaboration-builders.ts`
- Modify: `packages/workflow-engine/src/artifact-builders.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `tests/issue-draft-builder.test.ts`
- Create: `tests/issue-cli.test.ts`

- [ ] **Step 1: Write failing builder test**

Create `tests/issue-draft-builder.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ArtifactRef, BugReport } from "../packages/domain/src/index";
import { buildIssueDraftsFromBugReport } from "../packages/workflow-engine/src/index";

const bugReportRef: ArtifactRef = {
  id: "BugReport:abc",
  type: "BugReport",
  path: "reports/bug-report.json",
  schemaVersion: "0.1",
  createdBy: "test",
  createdAt: "2026-05-02T00:00:00.000Z",
  hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("IssueDraft builder", () => {
  test("builds explicit issue drafts from BugReport bugs", () => {
    const report: BugReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      bugs: [
        {
          id: "BUG-001",
          title: "保存按钮点击无响应",
          severity: "P0",
          testCaseId: "TC-001",
          flowId: "FLOW-001",
          stepId: "STEP-001",
          expected: "展示保存成功提示",
          actual: "无提示",
          screenshotRef: "EVID-SS-001",
          consoleLogRef: "EVID-CONSOLE",
          recommendation: "检查保存按钮点击事件绑定。",
        },
      ],
    };

    const drafts = buildIssueDraftsFromBugReport(bugReportRef, report);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      project: "demo",
      feature: "rule-config",
      sourceBugReportRef: "BugReport:abc",
      sourceBugId: "BUG-001",
      title: "保存按钮点击无响应",
      severity: "P0",
      evidenceRefs: ["EVID-SS-001", "EVID-CONSOLE"],
      confirmedForSync: false,
    });
    expect(drafts[0].descriptionMarkdown).toContain("TC-001");
    expect(drafts[0].descriptionMarkdown).toContain("展示保存成功提示");
    expect(drafts[0].reproductionSteps).toEqual([
      "Run run-1",
      "Open flow FLOW-001",
      "Execute step STEP-001",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
bun test tests/issue-draft-builder.test.ts
```

Expected: FAIL because `buildIssueDraftsFromBugReport` is not exported.

- [ ] **Step 3: Implement collaboration builders**

Create `packages/workflow-engine/src/collaboration-builders.ts`:

```ts
import type {
  ArtifactRef,
  BugReport,
  IssueDraft,
  LanhuWritebackDraft,
  RequirementSpec,
} from "../../domain/src/index";

function issueDraftPathSafeId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function issueDraftPath(draft: IssueDraft): string {
  return `reports/issues/${issueDraftPathSafeId(draft.sourceBugId)}.issue-draft.json`;
}

export function buildIssueDraftsFromBugReport(
  bugReportRef: ArtifactRef,
  report: BugReport,
): IssueDraft[] {
  return report.bugs.map((bug) => {
    const evidenceRefs = [bug.screenshotRef, bug.consoleLogRef].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    return {
      schemaVersion: "0.1",
      project: report.project,
      feature: report.feature,
      sourceBugReportRef: bugReportRef.id,
      sourceBugId: bug.id,
      title: bug.title,
      severity: bug.severity,
      descriptionMarkdown: [
        `## ${bug.title}`,
        "",
        `- Test Case: ${bug.testCaseId}`,
        `- Flow: ${bug.flowId}`,
        `- Step: ${bug.stepId}`,
        `- Expected: ${bug.expected}`,
        `- Actual: ${bug.actual}`,
        bug.recommendation ? `- Recommendation: ${bug.recommendation}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      reproductionSteps: [
        `Run ${report.runId}`,
        `Open flow ${bug.flowId}`,
        `Execute step ${bug.stepId}`,
      ],
      evidenceRefs,
      labels: ["automation", report.feature],
      confirmedForSync: false,
    };
  });
}

export function buildLanhuWritebackDraft(
  requirementSpecRef: ArtifactRef,
  requirement: RequirementSpec,
  targetUrl: string,
): LanhuWritebackDraft {
  return {
    schemaVersion: "0.1",
    project: requirement.project,
    feature: requirement.feature,
    sourceRequirementSpecRef: requirementSpecRef.id,
    targetUrl,
    summaryMarkdown: [
      `## ${requirement.title}`,
      "",
      ...requirement.rules.map((rule) => `- ${rule.id}: ${rule.text}`),
    ].join("\n"),
    changeRefs: requirement.rules.map((rule) => rule.id),
    confirmedForWriteback: false,
  };
}
```

Add to `packages/workflow-engine/src/artifact-builders.ts`:

```ts
export {
  buildIssueDraftsFromBugReport,
  buildLanhuWritebackDraft,
  issueDraftPath,
} from "./collaboration-builders";
```

Add the same exports to `packages/workflow-engine/src/index.ts` if `artifact-builders.ts` is not already re-exported wholesale.

- [ ] **Step 4: Add CLI issue draft command test**

Create `tests/issue-cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createFeatureWorkspace, featureDir, writeJsonArtifact } from "../packages/artifact-repo/src/index";
import type { BugReport } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("issue CLI", () => {
  test("writes explicit IssueDraft artifact from BugReport", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-issue-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    const report: BugReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      bugs: [
        {
          id: "BUG-001",
          title: "保存按钮点击无响应",
          severity: "P0",
          testCaseId: "TC-001",
          flowId: "FLOW-001",
          stepId: "STEP-001",
          expected: "展示保存成功提示",
          actual: "无提示",
        },
      ],
    };
    writeJsonArtifact(location, "BugReport", "reports/bug-report.json", report, "test", {
      allowedScopes: ["feature.reports"],
    });

    const dir = featureDir(location);
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "issue",
        "draft",
        "--feature-dir",
        dir,
        "--bug-report",
        "reports/bug-report.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(output).toContain("reports/issues/BUG-001.issue-draft.json");
    expect(existsSync(join(dir, "reports/issues/BUG-001.issue-draft.json"))).toBe(true);
    const draft = JSON.parse(
      readFileSync(join(dir, "reports/issues/BUG-001.issue-draft.json"), "utf8"),
    ) as { confirmedForSync: boolean };
    expect(draft.confirmedForSync).toBe(false);
  });
});
```

Remove the unused `writeFileSync` import if the editor reports it.

- [ ] **Step 5: Implement CLI issue draft command**

In `apps/cli/src/index.ts`, add `issue` to the grouped command logic:

```ts
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
```

Add imports:

```ts
import {
  featureDir as resolveFeatureDir,
  readArtifactIndex,
  readJsonArtifact,
  writeJsonArtifact,
} from "../../../packages/artifact-repo/src/index";
import {
  buildIssueDraftsFromBugReport,
  issueDraftPath,
} from "../../../packages/workflow-engine/src/index";
import type { BugReport } from "../../../packages/domain/src/index";
```

If `featureDir` conflicts with existing local names, alias it as shown above.

Add command handling before the final unknown command block:

```ts
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
```

- [ ] **Step 6: Run tests**

Run:

```bash
bun test tests/issue-draft-builder.test.ts tests/issue-cli.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-engine/src/collaboration-builders.ts packages/workflow-engine/src/artifact-builders.ts packages/workflow-engine/src/index.ts apps/cli/src/index.ts tests/issue-draft-builder.test.ts tests/issue-cli.test.ts
git commit -m "feat: build explicit issue drafts from bug reports"
```

---

## Task 4: Zentao Issue Tracker Plugin

**Objective:** Add a schema-backed Zentao issue sync plugin that only syncs manually confirmed `IssueDraft` artifacts.

**Files:**

- Modify: `packages/plugin-runtime/src/constraints.ts`
- Create: `plugins/zentao/package.json`
- Create: `plugins/zentao/plugin.yaml`
- Create: `plugins/zentao/src/mock.ts`
- Create: `plugins/zentao/src/real.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `tests/plugin-runtime.test.ts`
- Modify: `tests/domain.contracts.test.ts`
- Create: `tests/zentao-plugin.test.ts`
- Modify: `tests/issue-cli.test.ts`

- [ ] **Step 1: Update plugin runtime contracts test**

Add to `tests/plugin-runtime.test.ts`:

```ts
  test("allows issue tracker plugins to output IssueSyncResult", () => {
    const manifest: PluginManifest = {
      name: "zentao",
      title: "Zentao",
      version: "0.4.0",
      type: "issue-tracker",
      actions: [
        {
          id: "zentao.syncIssue",
          title: "Sync IssueDraft to Zentao",
          inputSchema: "IssueDraft",
          outputSchema: "IssueSyncResult",
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["ZENTAO_BASE_URL", "ZENTAO_TOKEN"],
        writeScopes: [],
      },
    };
    expect(() => validatePluginManifest(manifest)).not.toThrow();
  });
```

- [ ] **Step 2: Write failing Zentao plugin tests**

Create `tests/zentao-plugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { IssueDraft } from "../packages/domain/src/index";
import { mockSyncIssueToZentao } from "../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../plugins/zentao/src/real";

const draft: IssueDraft = {
  schemaVersion: "0.1",
  project: "demo",
  feature: "rule-config",
  sourceIssueDraftRef: "IssueDraft:abc",
  sourceBugReportRef: "BugReport:abc",
  sourceBugId: "BUG-001",
  title: "保存按钮点击无响应",
  severity: "P0",
  descriptionMarkdown: "保存按钮点击后无提示。",
  reproductionSteps: ["打开规则配置页", "点击保存按钮"],
  evidenceRefs: ["EVID-SS-001"],
  labels: ["automation"],
  confirmedForSync: true,
};

describe("Zentao plugin", () => {
  test("mock sync returns dry-run when requested", async () => {
    const result = await mockSyncIssueToZentao({ ...draft, confirmedForSync: false }, {
      dryRun: true,
    });
    expect(result.status).toBe("dry-run");
    expect(result.remoteId).toBeUndefined();
  });

  test("real sync rejects unconfirmed non-dry-run draft", async () => {
    await expect(
      syncIssueToZentao(
        { ...draft, confirmedForSync: false },
        {
          baseUrl: "https://zentao.example",
          token: "secret-token",
          dryRun: false,
          fetchImpl: async () => Response.json({ id: "1001" }),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT IssueDraft must be confirmedForSync");
  });

  test("real sync posts confirmed draft without leaking token", async () => {
    const token = "secret-token";
    let requestBody = "";
    let auth = "";
    const result = await syncIssueToZentao(draft, {
      baseUrl: "https://zentao.example",
      token,
      dryRun: false,
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body);
        auth = String((init?.headers as Record<string, string>).authorization);
        return Response.json({ id: "1001", url: "/bug-view-1001.html" });
      },
    });
    expect(requestBody).toContain("保存按钮点击无响应");
    expect(auth).toBe(`Bearer ${token}`);
    expect(result.status).toBe("synced");
    expect(result.remoteId).toBe("1001");
    expect(result.remoteUrl).toBe("https://zentao.example/bug-view-1001.html");
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
bun test tests/plugin-runtime.test.ts tests/zentao-plugin.test.ts
```

Expected: FAIL because the plugin and allowed output support are missing.

- [ ] **Step 4: Allow issue tracker output**

In `packages/plugin-runtime/src/constraints.ts`, ensure:

```ts
  "issue-tracker": ["IssueSyncResult"],
```

is present in `PLUGIN_OUTPUT_CONTRACTS`.

If `IssueSyncResult` was already present, keep it unchanged.

- [ ] **Step 5: Add Zentao plugin files**

Create `plugins/zentao/package.json`:

```json
{
  "name": "@kata-agent/plugin-zentao",
  "version": "0.4.0",
  "private": true,
  "type": "module"
}
```

Create `plugins/zentao/plugin.yaml`:

```yaml
name: zentao
title: Zentao 问题同步
version: 0.4.0
type: issue-tracker
actions:
  - id: zentao.syncIssue
    title: 同步 IssueDraft 到 Zentao
    inputSchema: IssueDraft
    outputSchema: IssueSyncResult
    sideEffects:
      network: true
      external: true
permissions:
  network: restricted
  secrets:
    - ZENTAO_BASE_URL
    - ZENTAO_TOKEN
  writeScopes: []
```

Create `plugins/zentao/src/mock.ts`:

```ts
import type {
  IssueDraft,
  IssueSyncResult,
} from "@kata-agent/domain";

export interface MockZentaoOptions {
  dryRun: boolean;
}

export async function mockSyncIssueToZentao(
  draft: IssueDraft,
  options: MockZentaoOptions,
): Promise<IssueSyncResult> {
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    tracker: "zentao",
    sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
    status: options.dryRun ? "dry-run" : "synced",
    remoteId: options.dryRun ? undefined : `MOCK-${draft.sourceBugId}`,
    remoteUrl: options.dryRun
      ? undefined
      : `https://zentao.example/bug-view-${encodeURIComponent(draft.sourceBugId)}.html`,
    message: options.dryRun ? "dry-run" : "mock synced",
    syncedAt: new Date().toISOString(),
  };
}

function requireSourceIssueDraftRef(draft: IssueDraft): string {
  if (!draft.sourceIssueDraftRef) {
    throw new Error("INVALID_INPUT IssueDraft.sourceIssueDraftRef is required");
  }
  return draft.sourceIssueDraftRef;
}
```

Create `plugins/zentao/src/real.ts`:

```ts
import type {
  IssueDraft,
  IssueSyncResult,
} from "@kata-agent/domain";

export interface ZentaoSyncOptions {
  baseUrl?: string;
  token?: string;
  dryRun: boolean;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

function severityToZentao(severity: IssueDraft["severity"]): string {
  if (severity === "P0") return "critical";
  if (severity === "P1") return "major";
  return "minor";
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("INVALID_INPUT Zentao base URL must use https");
  }
  return url.toString().replace(/\/$/, "");
}

export async function syncIssueToZentao(
  draft: IssueDraft,
  options: ZentaoSyncOptions,
): Promise<IssueSyncResult> {
  const syncedAt = new Date().toISOString();
  if (options.dryRun) {
    return {
      schemaVersion: "0.1",
      project: draft.project,
      feature: draft.feature,
      tracker: "zentao",
      sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
      status: "dry-run",
      message: "dry-run",
      syncedAt,
    };
  }
  if (!draft.confirmedForSync) {
    throw new Error("INVALID_INPUT IssueDraft must be confirmedForSync");
  }
  if (!options.baseUrl) throw new Error("MISSING_SECRET ZENTAO_BASE_URL");
  if (!options.token) throw new Error("MISSING_SECRET ZENTAO_TOKEN");

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/api/bugs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      title: draft.title,
      severity: severityToZentao(draft.severity),
      description: draft.descriptionMarkdown,
      steps: draft.reproductionSteps,
      labels: draft.labels,
      assignee: draft.assignee,
      evidenceRefs: draft.evidenceRefs,
      project: draft.project,
      feature: draft.feature,
      sourceBugId: draft.sourceBugId,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string | number;
    url?: string;
    message?: string;
  };
  if (!response.ok || !body.id) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT Zentao ${response.status} ${body.message ?? "unknown"}`,
    );
  }
  const remotePath = body.url ?? `/bug-view-${body.id}.html`;
  const remoteUrl = remotePath.startsWith("http")
    ? remotePath
    : `${baseUrl}${remotePath.startsWith("/") ? "" : "/"}${remotePath}`;
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    tracker: "zentao",
    sourceIssueDraftRef: requireSourceIssueDraftRef(draft),
    status: "synced",
    remoteId: String(body.id),
    remoteUrl,
    message: body.message ?? "created",
    syncedAt,
  };
}

function requireSourceIssueDraftRef(draft: IssueDraft): string {
  if (!draft.sourceIssueDraftRef) {
    throw new Error("INVALID_INPUT IssueDraft.sourceIssueDraftRef is required");
  }
  return draft.sourceIssueDraftRef;
}
```

- [ ] **Step 6: Register Zentao action in runtime factory**

In `packages/workflow-engine/src/runtime-factory.ts`, import:

```ts
import { mockSyncIssueToZentao } from "../../../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../../../plugins/zentao/src/real";
import type { IssueDraft } from "../../domain/src/index";
```

Register mock action in mock mode:

```ts
    actions.register("zentao.syncIssue", (input) =>
      mockSyncIssueToZentao(input as IssueDraft, {
        dryRun: true,
      }),
    );
```

Register real action in real mode:

```ts
    actions.register("zentao.syncIssue", (input) =>
      syncIssueToZentao(input as IssueDraft, {
        baseUrl: config.resolveSecret("ZENTAO_BASE_URL"),
        token: config.resolveSecret("ZENTAO_TOKEN"),
        dryRun: false,
      }),
    );
```

Workflow callers must pass `IssueDraft` with `sourceIssueDraftRef` populated from the artifact ref. Runtime registration never invents a placeholder ref; if a future workflow omits it, the plugin returns `INVALID_INPUT IssueDraft.sourceIssueDraftRef is required`.

- [ ] **Step 7: Add issue sync CLI command**

In `apps/cli/src/index.ts`, import:

```ts
import { LocalConfigLoader } from "../../../packages/core/src/index";
import type { IssueDraft } from "../../../packages/domain/src/index";
import { mockSyncIssueToZentao } from "../../../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../../../plugins/zentao/src/real";
```

Add:

```ts
function booleanFlag(name: string): boolean {
  return args.includes(name);
}
```

Add command handling:

```ts
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
    writeJsonArtifact(location, "IssueSyncResult", resultPath, result, "issue sync", {
      allowedScopes: ["feature.reports"],
    });
    console.log(JSON.stringify({ path: resultPath, result }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
```

- [ ] **Step 8: Extend CLI tests**

Append to `tests/issue-cli.test.ts`:

```ts
  test("issue sync rejects unconfirmed draft in real non-dry-run mode", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-issue-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "IssueDraft",
      "reports/issues/BUG-001.issue-draft.json",
      {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        sourceBugReportRef: "BugReport:abc",
        sourceBugId: "BUG-001",
        title: "保存失败",
        severity: "P0",
        descriptionMarkdown: "failure",
        reproductionSteps: ["click save"],
        evidenceRefs: [],
        labels: [],
        confirmedForSync: false,
      },
      "test",
      { allowedScopes: ["feature.reports"] },
    );
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "issue",
        "sync",
        "--mode",
        "real",
        "--feature-dir",
        featureDir(location),
        "--issue-draft",
        "reports/issues/BUG-001.issue-draft.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("INVALID_INPUT IssueDraft must be confirmedForSync");
  });
```

- [ ] **Step 9: Run tests**

Run:

```bash
bun test tests/plugin-runtime.test.ts tests/zentao-plugin.test.ts tests/issue-cli.test.ts tests/manifest-references.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/plugin-runtime/src/constraints.ts plugins/zentao/ packages/workflow-engine/src/runtime-factory.ts apps/cli/src/index.ts tests/plugin-runtime.test.ts tests/domain.contracts.test.ts tests/zentao-plugin.test.ts tests/issue-cli.test.ts tests/manifest-references.test.ts
git commit -m "feat: add Zentao issue sync plugin"
```

---

## Task 5: Guarded Lanhu Write-Back Plugin

**Objective:** Add optional Lanhu write-back behind a manually approved `LanhuWritebackDraft`, without changing the read-only `plugins/lanhu` requirement-source plugin.

**Files:**

- Modify: `packages/plugin-runtime/src/types.ts`
- Modify: `packages/plugin-runtime/src/constraints.ts`
- Modify: `schemas/plugin-manifest.schema.json`
- Create: `plugins/lanhu-writeback/package.json`
- Create: `plugins/lanhu-writeback/plugin.yaml`
- Create: `plugins/lanhu-writeback/src/mock.ts`
- Create: `plugins/lanhu-writeback/src/real.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `tests/plugin-runtime.test.ts`
- Modify: `tests/domain.contracts.test.ts`
- Create: `tests/lanhu-writeback-plugin.test.ts`
- Create: `tests/lanhu-writeback-cli.test.ts`

- [ ] **Step 1: Update plugin type tests**

In `tests/domain.contracts.test.ts`, update the `PluginManifest` type enum expectation:

```ts
    expectEnum("PluginManifest", ["properties", "type"], [
      "requirement-source",
      "artifact-export",
      "automation",
      "notification",
      "issue-tracker",
      "requirement-writeback",
      "rule-source",
    ]);
```

Add to `tests/plugin-runtime.test.ts`:

```ts
  test("allows requirement writeback plugins to output LanhuWritebackResult", () => {
    const manifest: PluginManifest = {
      name: "lanhu-writeback",
      title: "Lanhu Writeback",
      version: "0.4.0",
      type: "requirement-writeback",
      actions: [
        {
          id: "lanhuWriteback.writeRequirement",
          title: "Write requirement summary back to Lanhu",
          inputSchema: "LanhuWritebackDraft",
          outputSchema: "LanhuWritebackResult",
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["LANHU_WRITEBACK_COOKIE"],
        writeScopes: [],
      },
    };
    expect(() => validatePluginManifest(manifest)).not.toThrow();
  });
```

- [ ] **Step 2: Write failing Lanhu writeback tests**

Create `tests/lanhu-writeback-plugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { LanhuWritebackDraft } from "../packages/domain/src/index";
import { mockWriteLanhuRequirement } from "../plugins/lanhu-writeback/src/mock";
import { writeLanhuRequirement } from "../plugins/lanhu-writeback/src/real";

const draft: LanhuWritebackDraft = {
  schemaVersion: "0.1",
  project: "demo",
  feature: "rule-config",
  sourceRequirementSpecRef: "RequirementSpec:abc",
  targetUrl: "https://lanhu.example/prd/123",
  summaryMarkdown: "## 更新\n- REQ-001: 保存按钮文案为保存\n",
  changeRefs: ["REQ-001"],
  confirmedForWriteback: true,
  confirmedBy: "product-owner",
  confirmedAt: "2026-05-02T00:00:00.000Z",
};

describe("Lanhu writeback plugin", () => {
  test("mock writeback returns dry-run for CLI dryRun option", async () => {
    const result = await mockWriteLanhuRequirement(draft, { dryRun: true });
    expect(result.status).toBe("dry-run");
    expect(result.targetUrl).toBe(draft.targetUrl);
  });

  test("real writeback rejects unconfirmed non-dry-run draft", async () => {
    await expect(
      writeLanhuRequirement(
        { ...draft, confirmedForWriteback: false },
        {
          cookie: "secret-cookie",
          trustedDomains: ["lanhu.example"],
          dryRun: false,
          fetchImpl: async () => Response.json({ ok: true }),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback");
  });

  test("real writeback refuses to send cookie to untrusted host", async () => {
    await expect(
      writeLanhuRequirement(
        { ...draft, targetUrl: "https://example.com/prd/123" },
        {
          cookie: "secret-cookie",
          trustedDomains: ["lanhu.example"],
          dryRun: false,
          fetchImpl: async () => Response.json({ ok: true }),
        },
      ),
    ).rejects.toThrow("MISSING_SECRET refusing to send Lanhu writeback cookie to untrusted host");
  });

  test("real writeback posts confirmed draft without leaking cookie", async () => {
    let cookie = "";
    let body = "";
    const result = await writeLanhuRequirement(draft, {
      cookie: "secret-cookie",
      trustedDomains: ["lanhu.example"],
      dryRun: false,
      fetchImpl: async (_url, init) => {
        cookie = String((init?.headers as Record<string, string>).cookie);
        body = String(init?.body);
        return Response.json({ ok: true, url: "https://lanhu.example/prd/123" });
      },
    });
    expect(cookie).toBe("secret-cookie");
    expect(body).toContain("保存按钮文案");
    expect(result.status).toBe("written");
    expect(JSON.stringify(result)).not.toContain("secret-cookie");
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
bun test tests/plugin-runtime.test.ts tests/domain.contracts.test.ts tests/lanhu-writeback-plugin.test.ts
```

Expected: FAIL because `requirement-writeback` and plugin files are missing.

- [ ] **Step 4: Add plugin type and constraints**

In `packages/plugin-runtime/src/types.ts`, update `PluginType`:

```ts
export type PluginType =
  | "requirement-source"
  | "artifact-export"
  | "automation"
  | "notification"
  | "issue-tracker"
  | "requirement-writeback"
  | "rule-source";
```

In `packages/plugin-runtime/src/constraints.ts`, add:

```ts
  "requirement-writeback": ["LanhuWritebackResult"],
```

In `schemas/plugin-manifest.schema.json`, replace the `type.enum` array with the complete enum:

```json
{
  "type": "string",
  "enum": [
    "requirement-source",
    "artifact-export",
    "automation",
    "notification",
    "issue-tracker",
    "requirement-writeback",
    "rule-source"
  ]
}
```

- [ ] **Step 5: Add Lanhu writeback plugin files**

Create `plugins/lanhu-writeback/package.json`:

```json
{
  "name": "@kata-agent/plugin-lanhu-writeback",
  "version": "0.4.0",
  "private": true,
  "type": "module"
}
```

Create `plugins/lanhu-writeback/plugin.yaml`:

```yaml
name: lanhu-writeback
title: 蓝湖写回
version: 0.4.0
type: requirement-writeback
actions:
  - id: lanhuWriteback.writeRequirement
    title: 写回蓝湖需求摘要
    inputSchema: LanhuWritebackDraft
    outputSchema: LanhuWritebackResult
    sideEffects:
      network: true
      external: true
permissions:
  network: restricted
  secrets:
    - LANHU_WRITEBACK_COOKIE
    - LANHU_WRITEBACK_ALLOWED_HOSTS
  writeScopes: []
```

Create `plugins/lanhu-writeback/src/mock.ts`:

```ts
import type {
  LanhuWritebackDraft,
  LanhuWritebackResult,
} from "@kata-agent/domain";

export interface MockLanhuWritebackOptions {
  dryRun: boolean;
}

export async function mockWriteLanhuRequirement(
  draft: LanhuWritebackDraft,
  options: MockLanhuWritebackOptions,
): Promise<LanhuWritebackResult> {
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    provider: "lanhu",
    targetUrl: draft.targetUrl,
    status: options.dryRun ? "dry-run" : "written",
    remoteUrl: options.dryRun ? undefined : draft.targetUrl,
    message: options.dryRun ? "dry-run" : "mock written",
    writtenAt: new Date().toISOString(),
  };
}
```

Create `plugins/lanhu-writeback/src/real.ts`:

```ts
import type {
  LanhuWritebackDraft,
  LanhuWritebackResult,
} from "@kata-agent/domain";

export interface LanhuWritebackOptions {
  cookie?: string;
  trustedDomains: string[];
  dryRun: boolean;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

function isTrustedLanhuHost(hostname: string, trustedDomains: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return trustedDomains.some(
    (domain) =>
      normalized === domain.toLowerCase() ||
      normalized.endsWith(`.${domain.toLowerCase()}`),
  );
}

function assertTrustedLanhuTarget(
  url: string,
  trustedDomains: string[],
): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !isTrustedLanhuHost(parsed.hostname, trustedDomains)
  ) {
    throw new Error(
      "MISSING_SECRET refusing to send Lanhu writeback cookie to untrusted host",
    );
  }
}

export async function writeLanhuRequirement(
  draft: LanhuWritebackDraft,
  options: LanhuWritebackOptions,
): Promise<LanhuWritebackResult> {
  const writtenAt = new Date().toISOString();
  if (options.dryRun) {
    return {
      schemaVersion: "0.1",
      project: draft.project,
      feature: draft.feature,
      provider: "lanhu",
      targetUrl: draft.targetUrl,
      status: "dry-run",
      message: "dry-run",
      writtenAt,
    };
  }
  if (!draft.confirmedForWriteback) {
    throw new Error(
      "INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback",
    );
  }
  if (!options.cookie) throw new Error("MISSING_SECRET LANHU_WRITEBACK_COOKIE");
  if (options.trustedDomains.length === 0) {
    throw new Error("MISSING_SECRET LANHU_WRITEBACK_ALLOWED_HOSTS");
  }
  assertTrustedLanhuTarget(draft.targetUrl, options.trustedDomains);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(draft.targetUrl, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: options.cookie,
    },
    body: JSON.stringify({
      summaryMarkdown: draft.summaryMarkdown,
      changeRefs: draft.changeRefs,
      confirmedBy: draft.confirmedBy,
      confirmedAt: draft.confirmedAt,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    message?: string;
  };
  if (!response.ok || body.ok === false) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT Lanhu writeback ${response.status} ${body.message ?? "unknown"}`,
    );
  }
  return {
    schemaVersion: "0.1",
    project: draft.project,
    feature: draft.feature,
    provider: "lanhu",
    targetUrl: draft.targetUrl,
    status: "written",
    remoteUrl: body.url ?? draft.targetUrl,
    message: body.message ?? "updated",
    writtenAt,
  };
}
```

- [ ] **Step 6: Add Lanhu writeback CLI tests**

Create `tests/lanhu-writeback-cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFeatureWorkspace,
  featureDir,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { RequirementSpec } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function requirementSpec(): RequirementSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置",
    status: "confirmed",
    rules: [
      {
        id: "REQ-001",
        text: "保存按钮文案为保存。",
        severity: "P0",
        sourceType: "confirmation",
        sourceRefs: ["SRC-001"],
        confirmationQuestionId: "GAP-001",
      },
    ],
    pageContracts: [],
    openItems: [],
    assumptions: [],
  };
}

describe("Lanhu writeback CLI", () => {
  test("creates unapproved writeback draft from RequirementSpec", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-lanhu-wb-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "RequirementSpec",
      "requirement/spec/requirement-spec.json",
      requirementSpec(),
      "test",
      { allowedScopes: ["feature.requirement.spec"] },
    );
    const dir = featureDir(location);
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "lanhu",
        "writeback-draft",
        "--feature-dir",
        dir,
        "--requirement-spec",
        "requirement/spec/requirement-spec.json",
        "--target-url",
        "https://lanhu.example/prd/123",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    const path = join(dir, "reports/lanhu-writeback-draft.json");
    expect(existsSync(path)).toBe(true);
    const draft = JSON.parse(readFileSync(path, "utf8")) as {
      confirmedForWriteback: boolean;
    };
    expect(draft.confirmedForWriteback).toBe(false);
  });

  test("writeback rejects unapproved non-dry-run draft", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-lanhu-wb-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    createFeatureWorkspace(location);
    writeJsonArtifact(
      location,
      "LanhuWritebackDraft",
      "reports/lanhu-writeback-draft.json",
      {
        schemaVersion: "0.1",
        project: "demo",
        feature: "rule-config",
        sourceRequirementSpecRef: "RequirementSpec:abc",
        targetUrl: "https://lanhu.example/prd/123",
        summaryMarkdown: "change",
        changeRefs: ["REQ-001"],
        confirmedForWriteback: false,
      },
      "test",
      { allowedScopes: ["feature.reports"] },
    );
    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "lanhu",
        "writeback",
        "--mode",
        "real",
        "--feature-dir",
        featureDir(location),
        "--draft",
        "reports/lanhu-writeback-draft.json",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(error).toContain("INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback");
  });
});
```

- [ ] **Step 7: Implement runtime and CLI wiring**

In `packages/workflow-engine/src/runtime-factory.ts`, import:

```ts
import { mockWriteLanhuRequirement } from "../../../plugins/lanhu-writeback/src/mock";
import { writeLanhuRequirement } from "../../../plugins/lanhu-writeback/src/real";
import type { LanhuWritebackDraft } from "../../domain/src/index";
```

Add a config parser near `createRuntimeServices`:

```ts
function parseTrustedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
```

Register mock mode:

```ts
    actions.register("lanhuWriteback.writeRequirement", (input) =>
      mockWriteLanhuRequirement(input as LanhuWritebackDraft, { dryRun: true }),
    );
```

Register real mode:

```ts
    actions.register("lanhuWriteback.writeRequirement", (input) =>
      writeLanhuRequirement(input as LanhuWritebackDraft, {
        cookie: config.resolveSecret("LANHU_WRITEBACK_COOKIE"),
        trustedDomains: parseTrustedDomains(
          config.resolveSecret("LANHU_WRITEBACK_ALLOWED_HOSTS"),
        ),
        dryRun: false,
      }),
    );
```

In `apps/cli/src/index.ts`, import:

```ts
import type {
  LanhuWritebackDraft,
  RequirementSpec,
} from "../../../packages/domain/src/index";
import { buildLanhuWritebackDraft } from "../../../packages/workflow-engine/src/index";
import { mockWriteLanhuRequirement } from "../../../plugins/lanhu-writeback/src/mock";
import { writeLanhuRequirement } from "../../../plugins/lanhu-writeback/src/real";
```

Add this helper near the other CLI helpers:

```ts
function parseTrustedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
```

Add command handling:

```ts
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
      JSON.stringify({ path: "reports/lanhu-writeback-result.json", result }, null, 2),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
bun test tests/plugin-runtime.test.ts tests/domain.contracts.test.ts tests/manifest-references.test.ts tests/lanhu-writeback-plugin.test.ts tests/lanhu-writeback-cli.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-runtime/src/types.ts packages/plugin-runtime/src/constraints.ts schemas/plugin-manifest.schema.json plugins/lanhu-writeback/ packages/workflow-engine/src/runtime-factory.ts apps/cli/src/index.ts tests/plugin-runtime.test.ts tests/domain.contracts.test.ts tests/lanhu-writeback-plugin.test.ts tests/lanhu-writeback-cli.test.ts tests/manifest-references.test.ts
git commit -m "feat: add guarded Lanhu writeback plugin"
```

---

## Task 6: Documentation and External Collaboration Verification

**Objective:** Document the new v0.4 external collaboration commands and run full verification with secret/path scans.

**Files:**

- Modify: `README.md`
- No production files for verification.

- [ ] **Step 1: Update README**

Append this section to `README.md`:

```md
## v0.4 External Collaboration Plugins

External collaboration side effects are explicit and schema-backed.

### DingTalk notification

`test-case-gen` can send the rendered confirmation draft to DingTalk before it waits for manual confirmation import.

Environment variables for real DingTalk delivery:

- `DINGTALK_WEBHOOK_URL`
- `DINGTALK_SECRET` when the robot uses signed webhooks

Run with real delivery:

```sh
bun apps/cli/src/index.ts test-case-gen --mode real --notify real --project <project> --feature <feature> --source-url <lanhu-url> --root .
```

DingTalk does not approve requirements. Import the canonical confirmation JSON with:

```sh
bun apps/cli/src/index.ts confirmation import --feature-dir <feature-dir> --run <run-id> --file confirmation-result.json --project <project> --feature <feature>
```

### Zentao issue sync

Create explicit issue drafts from a bug report:

```sh
bun apps/cli/src/index.ts issue draft --feature-dir <feature-dir> --bug-report reports/bug-report.json
```

After reviewing and setting `confirmedForSync` to `true`, sync one draft:

```sh
bun apps/cli/src/index.ts issue sync --mode real --feature-dir <feature-dir> --issue-draft reports/issues/<bug-id>.issue-draft.json
```

Environment variables for real Zentao sync:

- `ZENTAO_BASE_URL`
- `ZENTAO_TOKEN`

### Lanhu write-back

Create a write-back draft from a confirmed requirement spec:

```sh
bun apps/cli/src/index.ts lanhu writeback-draft --feature-dir <feature-dir> --requirement-spec requirement/spec/requirement-spec.json --target-url <lanhu-url>
```

After manual review, set `confirmedForWriteback` to `true` and provide `confirmedBy` / `confirmedAt`. Then run:

```sh
bun apps/cli/src/index.ts lanhu writeback --mode real --feature-dir <feature-dir> --draft reports/lanhu-writeback-draft.json
```

Validate the same draft without writing by passing the CLI flag:

```sh
bun apps/cli/src/index.ts lanhu writeback --mode real --dry-run --feature-dir <feature-dir> --draft reports/lanhu-writeback-draft.json
```

Environment variable for real Lanhu write-back:

- `LANHU_WRITEBACK_COOKIE`
- `LANHU_WRITEBACK_ALLOWED_HOSTS`, comma-separated hostnames such as `lanhu.example,lanhuapp.com`
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
bun run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run extension-point terminology scan**

Run:

```bash
rg -n "Capabilit[y]|integratio[n]|autonomous approva[l]|auto-approv[e]|type: branc[h]|type: paralle[l]|type: merg[e]|type: knowledg[e]" README.md apps packages plugins schemas tests workflows agents skills docs/superpowers/plans/2026-05-02-kata-agent-v0.4-external-collaboration-plugins.md
```

Expected: no hits except intentional prose explaining excluded approval automation.

- [ ] **Step 5: Run secret and local path scan**

Run:

```bash
rg -n "DINGTALK_WEBHOOK_URL[=].*https://|ZENTAO_TOKEN[=]|LANHU_WRITEBACK_COOKIE[=]|Bearer [[:alnum:]]|/User[s]/|/privat[e]/|https://[^ ]*interna[l]" README.md apps packages plugins schemas tests workflows agents skills docs/superpowers/plans/2026-05-02-kata-agent-v0.4-external-collaboration-plugins.md
```

Expected: no hardcoded secrets, bearer tokens, local absolute paths, or internal URLs.

- [ ] **Step 6: Run review-regression scan**

Run:

```bash
rg -n 'from "../../../packages/domain/src/index"' plugins
rg -n 'trustedDomains = \[' plugins/lanhu-writeback
rg -n 'sourceIssueDraftRef: "IssueDraft:runtim[e]"|draft\\.[d]ryRun' apps packages plugins schemas tests
```

Expected:

- no plugin implementation imports domain contracts by relative package traversal
- no hardcoded Lanhu trusted domain list in plugin implementation
- no hardcoded `IssueDraft:runtime` source refs
- no `LanhuWritebackDraft.dryRun` schema or implementation access

- [ ] **Step 7: Verify plugin manifests and package list**

Run:

```bash
bun test tests/manifest-references.test.ts tests/plugin-runtime.test.ts
find apps packages plugins -mindepth 2 -maxdepth 2 -name package.json -print | sort
```

Expected package list includes:

```text
apps/cli/package.json
packages/agent-runner/package.json
packages/artifact-repo/package.json
packages/core/package.json
packages/domain/package.json
packages/knowledge-repo/package.json
packages/plugin-runtime/package.json
packages/skill-runner/package.json
packages/workflow-engine/package.json
plugins/lanhu/package.json
plugins/lanhu-writeback/package.json
plugins/notify/package.json
plugins/playwright/package.json
plugins/report/package.json
plugins/xmind/package.json
plugins/zentao/package.json
```

- [ ] **Step 8: Commit**

```bash
git add README.md docs/superpowers/plans/2026-05-02-kata-agent-v0.4-external-collaboration-plugins.md
git commit -m "docs: document v0.4 external collaboration plugins"
```

---

## Self-Review

Spec coverage:

- §11 Human Confirmation: Task 2 sends `ConfirmationDraft` through DingTalk and still requires `confirmation import` for `ConfirmationResult`.
- §12 Plugin System: Tasks 1, 4, and 5 keep plugins side-effect declared and schema-backed; Task 5 adds a dedicated plugin type for requirement write-back instead of overloading requirement-source.
- §14 Artifact Repository: Tasks 2, 3, 4, and 5 write all outputs under existing allowed scopes.
- §20 Error Classification: Tasks 1, 4, and 5 use `MISSING_SECRET`, `INVALID_INPUT`, and `PLUGIN_NETWORK_TRANSIENT` messages consistently with existing retry handling.
- §22 Extension Points: DingTalk send, Zentao sync, and Lanhu write-back are implemented; reply collection remains excluded by scope.
- v0.4 Roadmap: DingTalk notification, Zentao issue sync from `IssueDraft`, and optional manually confirmed Lanhu write-back are all covered.

Placeholder scan:

- No task uses forbidden placeholder tokens or cross-task shorthand.
- Every code-changing task includes concrete test code, implementation code, commands, expected outcomes, and commit commands.

Type consistency:

- `NotificationRequest` / `NotificationResult` fields match tests, schemas, mock plugin, and DingTalk plugin.
- `IssueDraft` / `IssueSyncResult` fields match builder, schemas, Zentao plugin, and CLI; sync handlers read `sourceIssueDraftRef` from plugin input and never hardcode a placeholder ref.
- `LanhuWritebackDraft` / `LanhuWritebackResult` fields match builder, schemas, writeback plugin, and CLI; dry-run is passed through CLI/plugin options, not stored in the draft artifact.
- `plugins/*/src/*.ts` implementation snippets import domain contracts from `@kata-agent/domain`.
- Lanhu write-back trusted hosts are injected through `LANHU_WRITEBACK_ALLOWED_HOSTS`, parsed by runtime/CLI config, and passed to the plugin.
- Plugin action ids are consistent:
  - `notify.sendNotification`
  - `zentao.syncIssue`
  - `lanhuWriteback.writeRequirement`
