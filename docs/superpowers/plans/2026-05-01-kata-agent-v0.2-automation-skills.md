# kata-agent v0.2 Automation Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second-stage web automation foundation: generate strict Playwright-ready automation artifacts from `TestSpec`, execute a deterministic web automation run through a workflow-controlled plugin action, and persist `RunRecord` plus `EvidencePack`.

**Architecture:** Keep the Workflow Engine as the only flow controller. `ui-script-gen` is a Skill with its own linear workflow; it reads the `TestSpec` produced by `test-case-gen`, builds `FlowSpec` and `RunPlan`, invokes a web-only Playwright automation plugin, and writes evidence/report artifacts through the Artifact Repository. v0.2 does not implement mobile automation, desktop automation, external bug submission, or full `report-gen`; it only creates the tested bridge artifacts needed by later phases.

**Tech Stack:** TypeScript, Bun workspaces, Bun test, Ajv JSON Schema validation, YAML manifests, existing Artifact Repository / Workflow Engine / Plugin Runtime contracts, deterministic Playwright plugin shell with mocked execution in tests.

---

## Scope

This plan implements the v0.2 Automation Skills slice from `docs/superpowers/specs/2026-05-01-kata-agent-architecture-design.md` and the roadmap in `docs/superpowers/plans/2026-05-01-kata-agent-v0.1-foundation.md`.

Included:

- Fix first-stage closure issues that block reliable second-stage execution.
- Add schema-backed contracts for `UiScriptGenInput`, `FlowSpec`, `RunPlan`, `RunRecord`, and `EvidencePack`.
- Add strict web automation assertion policy.
- Add `ui-script-gen` skill manifest and workflow.
- Add `playwright` automation plugin manifest and deterministic runner shell.
- Extend runtime factory, CLI, and WorkflowExecutor to run `ui-script-gen` with mocks.
- Add tests for schema refs, workflow refs, path safety, trace, and end-to-end mocked automation.

Excluded:

- Mobile automation.
- Desktop automation.
- Full API automation surface.
- Real browser installation or browser downloads in tests.
- External issue tracker writes.
- Full `report-gen`; v0.2 only writes an automation failure bridge report artifact.
- Free-form agent collaboration. Agents, plugins, and CLI commands do not branch the flow.

## File Structure

- Modify `apps/cli/src/index.ts`
  - Validate `ConfirmationResult` with SCHEMA_REGISTRY/Ajv.
  - Add `ui-script-gen` CLI command.
- Modify `packages/workflow-engine/src/executor.ts`
  - Persist failed node state on exceptions.
  - Dispatch `ui-script-gen` workflow nodes.
- Modify `packages/workflow-engine/src/types.ts`
  - Add optional workflow execution inputs without adding new node types.
- Modify `packages/workflow-engine/src/runtime-factory.ts`
  - Register `playwright.runPlan` in mock mode.
- Create `packages/workflow-engine/src/automation-policy.ts`
  - Validate strict assertion and web-only readiness rules.
- Modify `packages/workflow-engine/src/gates.ts`
  - Register `automation-script-readiness`.
- Modify `packages/workflow-engine/src/artifact-builders.ts`
  - Build `FlowSpec`, `RunPlan`, `EvidencePack`, and automation report markdown.
- Modify `packages/workflow-engine/src/index.ts`
  - Export new policy and builder functions.
- Create `packages/domain/src/automation.ts`
  - TypeScript domain types for v0.2 automation artifacts.
- Modify `packages/domain/src/index.ts`
  - Export automation types.
- Modify `packages/domain/src/schemas.ts`
  - Add automation schemas to `SCHEMA_REGISTRY`.
- Create schemas:
  - `schemas/ui-script-gen-input.schema.json`
  - `schemas/flow-spec.schema.json`
  - `schemas/run-plan.schema.json`
  - `schemas/run-record.schema.json`
  - `schemas/evidence-pack.schema.json`
- Create `plugins/playwright/package.json`
- Create `plugins/playwright/plugin.yaml`
- Create `plugins/playwright/src/mock.ts`
- Create `skills/ui-script-gen/skill.yaml`
- Create `workflows/ui-script-gen.yaml`
- Modify tests:
  - `tests/cli.smoke.test.ts`
  - `tests/workflow-executor.test.ts`
  - `tests/domain.contracts.test.ts`
  - `tests/domain.validator.test.ts`
  - `tests/manifest-references.test.ts`
- Create tests:
  - `tests/automation.contracts.test.ts`
  - `tests/automation-policy.test.ts`
  - `tests/playwright-plugin.test.ts`
  - `tests/ui-script-gen.runtime.test.ts`

## Hard Constraints

- Use Bun workspaces. `plugins/playwright/package.json` must exist.
- Keep `SCHEMA_REGISTRY` as schema source of truth.
- Keep workflow node types exactly: `tool`, `agent`, `gate`, `human`, `artifact`.
- Use Skill, not Capability.
- Use plugins, not integrations.
- Use XMind terminology only where XMind artifacts are involved; v0.2 automation artifacts are not XMind.
- Do not migrate Archive as a source of truth.
- Do not hardcode absolute paths.
- Do not hardcode credentials, cookies, tokens, or internal URLs.
- File tests must use temp dirs and clean them up.
- Do not weaken assertions to make automation pass.
- `ui-script-gen` is web-only in v0.2.
- `WorkflowExecutor` remains the only flow controller.

---

## Task 0: First-Stage Closure Fixes

**Files:**

- Modify: `apps/cli/src/index.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `docs/superpowers/plans/2026-05-01-kata-agent-v0.1c-real-providers.md`
- Modify: `tests/cli.smoke.test.ts`
- Modify: `tests/workflow-executor.test.ts`

- [x] **Step 1: Add a failing CLI test for invalid ConfirmationResult**

Append this test to `tests/cli.smoke.test.ts` inside the existing `describe("cli", ...)` block:

```ts
  test("rejects invalid confirmation answer statuses before marking human node succeeded", async () => {
    const featureDir = mkdtempSync(join(tmpdir(), "kata-agent-feature-"));
    roots.push(featureDir);
    mkdirSync(join(featureDir, ".state"), { recursive: true });
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    saveWorkflowState(
      featureDir,
      markWaiting(
        createRunState(definition, "run-invalid-confirmation"),
        "await-confirmation-result",
        "ConfirmationResult",
      ),
    );
    const confirmationPath = join(featureDir, "bad-confirmation-result.json");
    writeFileSync(
      confirmationPath,
      JSON.stringify({
        schemaVersion: "0.1",
        answers: [
          {
            questionId: "GAP-001",
            status: "accepted",
            answer: "保存",
          },
        ],
      }),
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "confirmation",
        "import",
        "--feature-dir",
        featureDir,
        "--run",
        "run-invalid-confirmation",
        "--file",
        confirmationPath,
        "--project",
        "demo",
        "--feature",
        "rule-config",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const saved = JSON.parse(
      readFileSync(
        join(featureDir, ".state", "run-invalid-confirmation.json"),
        "utf8",
      ),
    );

    expect(exitCode).toBe(1);
    expect(error).toContain("SCHEMA_VALIDATION_FAILED ConfirmationResult");
    expect(saved.nodes["await-confirmation-result"].status).toBe("waiting");
  });
```

- [x] **Step 2: Run the CLI test and verify it fails**

Run:

```bash
bun test tests/cli.smoke.test.ts
```

Expected: FAIL because `apps/cli/src/index.ts` accepts `status: "accepted"` as long as `answers` is an array.

- [x] **Step 3: Validate ConfirmationResult with Ajv in CLI import**

In `apps/cli/src/index.ts`, replace the `SCHEMA_VERSION` import with `assertValidSchema`:

```ts
import { assertValidSchema } from "../../../packages/domain/src/index";
```

Replace the current `confirmation import` parsing block with:

```ts
  const rawConfirmation = readFileSync(file, "utf8");
  let confirmation: unknown;
  try {
    confirmation = JSON.parse(rawConfirmation) as unknown;
    assertValidSchema("ConfirmationResult", confirmation);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const canonicalConfirmation = `${JSON.stringify(confirmation, null, 2)}\n`;
```

In the `writeArtifactInFeatureDir` call, replace `rawConfirmation` with `canonicalConfirmation`:

```ts
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
```

- [x] **Step 4: Run the CLI test and verify it passes**

Run:

```bash
bun test tests/cli.smoke.test.ts
```

Expected: PASS.

- [x] **Step 5: Add a failing executor test for failed node persistence**

Append this test to `tests/workflow-executor.test.ts` inside the existing `describe("workflow executor", ...)` block:

```ts
  test("marks a failing action node as failed and persists the error", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const actions = new PluginActionRegistry();
    actions.register("lanhu.fetchRequirement", () => {
      throw new Error("PLUGIN_NETWORK_TRANSIENT 503");
    });
    const executor = new WorkflowExecutor({
      agentRunner: new AgentRunner(new ProviderRegistry()),
      actions,
      agents: new Map(),
    });
    const definition: WorkflowDefinition = {
      id: "failure-workflow",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [
        { id: "create-feature-workspace", type: "artifact" },
        {
          id: "ingest-requirement-source",
          type: "tool",
          action: "lanhu.fetchRequirement",
          dependsOn: ["create-feature-workspace"],
        },
      ],
    };

    const result = await executor.start({
      location,
      definition,
      runId: "run-failure",
      sourceUrl: "mock://failure",
    });
    const dir = featureDir(location);
    const saved = loadWorkflowState(dir, "run-failure");

    expect(result.state.status).toBe("failed");
    expect(saved.status).toBe("failed");
    expect(saved.nodes["ingest-requirement-source"].status).toBe("failed");
    expect(saved.nodes["ingest-requirement-source"].error).toContain(
      "PLUGIN_NETWORK_TRANSIENT 503",
    );
  });
```

- [x] **Step 6: Run the executor test and verify it fails**

Run:

```bash
bun test tests/workflow-executor.test.ts
```

Expected: FAIL because the executor rethrows the error and leaves the node state as `running`.

- [x] **Step 7: Persist failed node state in WorkflowExecutor**

In `packages/workflow-engine/src/executor.ts`, add `markFailed` to the state imports:

```ts
  markBlocked,
  markFailed,
  markRunning,
```

Replace the catch block at the end of the node dispatch with:

```ts
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes("TRANSIENT") || message.includes("429");
        state = markFailed(state, node.id, message, retryable);
        appendTrace(dir, {
          runId: context.runId,
          nodeId: node.id,
          type: "exit",
          actionId: node.action,
          gateId: node.gate,
          at: new Date().toISOString(),
          message,
        });
        saveWorkflowState(dir, state);
        return { state };
      }
```

- [x] **Step 8: Run the executor test and verify it passes**

Run:

```bash
bun test tests/workflow-executor.test.ts
```

Expected: PASS.

- [x] **Step 9: Make the v0.1c secret scan command runnable with checked source scope**

In `docs/superpowers/plans/2026-05-01-kata-agent-v0.1c-real-providers.md`, replace the secret/path scan command with:

```bash
rg -n "LANHU_COOKIE=|Bearer [A-Za-z0-9]|https://[^ ]*internal|/Users/|/private/" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```

Expected text below it:

```md
Expected: no hardcoded secrets, internal URLs, or local absolute paths in checked source, tests, manifests, package metadata, or README.
```

- [x] **Step 10: Verify Task 0**

Run:

```bash
bun test tests/cli.smoke.test.ts tests/workflow-executor.test.ts
bun run typecheck
rg -n "LANHU_COOKIE=|Bearer [A-Za-z0-9]|https://[^ ]*internal|/Users/|/private/" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```

Expected: tests pass, typecheck passes, `rg` exits with no matches.

- [x] **Step 11: Commit Task 0**

```bash
git add apps/cli/src/index.ts packages/workflow-engine/src/executor.ts tests/cli.smoke.test.ts tests/workflow-executor.test.ts docs/superpowers/plans/2026-05-01-kata-agent-v0.1c-real-providers.md
git commit -m "fix: close runtime foundation gaps"
```

---

## Task 1: Automation Domain Contracts

**Files:**

- Create: `packages/domain/src/automation.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/schemas.ts`
- Create: `schemas/ui-script-gen-input.schema.json`
- Create: `schemas/flow-spec.schema.json`
- Create: `schemas/run-plan.schema.json`
- Create: `schemas/run-record.schema.json`
- Create: `schemas/evidence-pack.schema.json`
- Create: `tests/automation.contracts.test.ts`
- Modify: `tests/domain.contracts.test.ts`
- Modify: `tests/domain.validator.test.ts`

- [x] **Step 1: Write failing automation contract tests**

Create `tests/automation.contracts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  SCHEMA_REGISTRY,
  validateSchema,
  type EvidencePack,
  type FlowSpec,
  type RunPlan,
  type RunRecord,
  type UiScriptGenInput,
} from "../packages/domain/src/index";

describe("automation domain contracts", () => {
  test("automation schemas are registered", () => {
    expect(SCHEMA_REGISTRY.UiScriptGenInput).toBe(
      "schemas/ui-script-gen-input.schema.json",
    );
    expect(SCHEMA_REGISTRY.FlowSpec).toBe("schemas/flow-spec.schema.json");
    expect(SCHEMA_REGISTRY.RunPlan).toBe("schemas/run-plan.schema.json");
    expect(SCHEMA_REGISTRY.RunRecord).toBe("schemas/run-record.schema.json");
    expect(SCHEMA_REGISTRY.EvidencePack).toBe(
      "schemas/evidence-pack.schema.json",
    );
  });

  test("accepts valid web automation artifacts", () => {
    const input: UiScriptGenInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      testSpecPath: "test-spec/test-spec.json",
      mode: "mock",
    };
    const flow: FlowSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceTestSpecRef: "TestSpec:test",
      flows: [
        {
          id: "FLOW-001",
          title: "保存规则",
          testCaseId: "TC-001",
          priority: "P0",
          surface: "web",
          entry: { url: "/rules" },
          steps: [
            {
              id: "STEP-001",
              action: "click",
              target: "button:保存",
              expected: "toast text is 保存成功",
              assertionRefs: ["ASSERT-001"],
            },
          ],
          assertions: [
            {
              id: "ASSERT-001",
              layer: "L3",
              kind: "text",
              target: "toast",
              expected: "保存成功",
              requirementRefs: ["REQ-001"],
            },
          ],
        },
      ],
    };
    const plan: RunPlan = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runner: "playwright",
      mode: "mock",
      sourceFlowSpecRef: "FlowSpec:test",
      scriptPath: "automation/playwright/generated.spec.ts",
      flows: [
        {
          flowId: "FLOW-001",
          testCaseId: "TC-001",
          title: "保存规则",
          entryUrl: "/rules",
          steps: [
            {
              id: "STEP-001",
              action: "click",
              selector: "text=保存",
              expected: "toast text is 保存成功",
            },
          ],
          assertions: [
            {
              id: "ASSERT-001",
              layer: "L3",
              kind: "text",
              selector: "[role=status]",
              expected: "保存成功",
            },
          ],
        },
      ],
    };
    const record: RunRecord = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "passed",
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:00:01.000Z",
      caseResults: [
        {
          testCaseId: "TC-001",
          status: "passed",
          assertionResults: [
            {
              assertionId: "ASSERT-001",
              status: "passed",
              expected: "保存成功",
            },
          ],
        },
      ],
      evidenceFiles: ["automation/evidence/run-log.txt"],
    };
    const evidence: EvidencePack = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runRecordRef: "RunRecord:test",
      evidence: [
        {
          id: "EVID-001",
          kind: "run-log",
          path: "automation/evidence/run-log.txt",
          hash: "sha256:abc",
        },
      ],
    };

    expect(validateSchema("UiScriptGenInput", input).valid).toBe(true);
    expect(validateSchema("FlowSpec", flow).valid).toBe(true);
    expect(validateSchema("RunPlan", plan).valid).toBe(true);
    expect(validateSchema("RunRecord", record).valid).toBe(true);
    expect(validateSchema("EvidencePack", evidence).valid).toBe(true);
  });

  test("rejects non-web automation surfaces in v0.2", () => {
    const result = validateSchema("FlowSpec", {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceTestSpecRef: "TestSpec:test",
      flows: [
        {
          id: "FLOW-001",
          title: "移动端保存规则",
          testCaseId: "TC-001",
          priority: "P0",
          surface: "mobile",
          entry: { url: "/rules" },
          steps: [],
          assertions: [],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(
      "must be equal to one of the allowed values",
    );
  });
});
```

- [x] **Step 2: Run automation contract tests and verify they fail**

Run:

```bash
bun test tests/automation.contracts.test.ts
```

Expected: FAIL because automation types and schema registry entries do not exist.

- [x] **Step 3: Add TypeScript automation contracts**

Create `packages/domain/src/automation.ts`:

```ts
import type { TestAssertionLayer } from "./test-spec";

export interface UiScriptGenInput {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  testSpecPath: string;
  mode: "mock" | "real";
}

export type AutomationSurface = "web";
export type AutomationPriority = "P0" | "P1" | "P2";
export type FlowAssertionKind = "text" | "url" | "visibility" | "network" | "state";
export type RunMode = "mock" | "real";
export type RunStatus = "passed" | "failed" | "blocked";
export type CaseRunStatus = "passed" | "failed" | "skipped" | "blocked";
export type EvidenceKind =
  | "screenshot"
  | "trace"
  | "console"
  | "network"
  | "dom-snapshot"
  | "run-log";

export interface FlowSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  sourceTestSpecRef: string;
  flows: Array<{
    id: string;
    title: string;
    testCaseId: string;
    priority: AutomationPriority;
    surface: AutomationSurface;
    entry: { url: string };
    steps: Array<{
      id: string;
      action: string;
      target: string;
      expected: string;
      assertionRefs: string[];
    }>;
    assertions: Array<{
      id: string;
      layer: TestAssertionLayer;
      kind: FlowAssertionKind;
      target: string;
      expected: string;
      requirementRefs: string[];
    }>;
  }>;
}

export interface RunPlan {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runner: "playwright";
  mode: RunMode;
  sourceFlowSpecRef: string;
  scriptPath: string;
  flows: Array<{
    flowId: string;
    testCaseId: string;
    title: string;
    entryUrl: string;
    steps: Array<{
      id: string;
      action: string;
      selector: string;
      expected: string;
    }>;
    assertions: Array<{
      id: string;
      layer: TestAssertionLayer;
      kind: FlowAssertionKind;
      selector: string;
      expected: string;
    }>;
  }>;
}

export interface RunRecord {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runId: string;
  runner: "playwright";
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  caseResults: Array<{
    testCaseId: string;
    status: CaseRunStatus;
    assertionResults: Array<{
      assertionId: string;
      status: "passed" | "failed";
      expected: string;
      actual?: string;
      message?: string;
    }>;
  }>;
  evidenceFiles: string[];
}

export interface EvidencePack {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  runRecordRef: string;
  evidence: Array<{
    id: string;
    kind: EvidenceKind;
    path: string;
    hash: string;
  }>;
}
```

- [x] **Step 4: Export automation contracts**

In `packages/domain/src/index.ts`, add:

```ts
export type {
  AutomationPriority,
  AutomationSurface,
  CaseRunStatus,
  EvidenceKind,
  EvidencePack,
  FlowAssertionKind,
  FlowSpec,
  RunMode,
  RunPlan,
  RunRecord,
  RunStatus,
  UiScriptGenInput,
} from "./automation";
```

- [x] **Step 5: Register automation schemas**

In `packages/domain/src/schemas.ts`, add these entries before `PluginManifest`:

```ts
  UiScriptGenInput: "schemas/ui-script-gen-input.schema.json",
  FlowSpec: "schemas/flow-spec.schema.json",
  RunPlan: "schemas/run-plan.schema.json",
  RunRecord: "schemas/run-record.schema.json",
  EvidencePack: "schemas/evidence-pack.schema.json",
```

- [x] **Step 6: Create UiScriptGenInput schema**

Create `schemas/ui-script-gen-input.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/ui-script-gen-input.schema.json",
  "title": "UiScriptGenInput",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "testSpecPath", "mode"],
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
    "testSpecPath": {
      "type": "string",
      "pattern": "^test-spec/test-spec\\.json$"
    },
    "mode": { "type": "string", "enum": ["mock", "real"] }
  },
  "additionalProperties": false
}
```

- [x] **Step 7: Create FlowSpec schema**

Create `schemas/flow-spec.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/flow-spec.schema.json",
  "title": "FlowSpec",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "sourceTestSpecRef", "flows"],
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
    "sourceTestSpecRef": { "type": "string" },
    "flows": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "testCaseId", "priority", "surface", "entry", "steps", "assertions"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "testCaseId": { "type": "string" },
          "priority": { "type": "string", "enum": ["P0", "P1", "P2"] },
          "surface": { "type": "string", "enum": ["web"] },
          "entry": {
            "type": "object",
            "required": ["url"],
            "properties": { "url": { "type": "string", "minLength": 1 } },
            "additionalProperties": false
          },
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "action", "target", "expected", "assertionRefs"],
              "properties": {
                "id": { "type": "string" },
                "action": { "type": "string", "minLength": 1 },
                "target": { "type": "string", "minLength": 1 },
                "expected": { "type": "string", "minLength": 1 },
                "assertionRefs": {
                  "type": "array",
                  "items": { "type": "string" }
                }
              },
              "additionalProperties": false
            }
          },
          "assertions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "layer", "kind", "target", "expected", "requirementRefs"],
              "properties": {
                "id": { "type": "string" },
                "layer": { "type": "string", "enum": ["L1", "L2", "L3", "L4", "L5"] },
                "kind": { "type": "string", "enum": ["text", "url", "visibility", "network", "state"] },
                "target": { "type": "string", "minLength": 1 },
                "expected": { "type": "string", "minLength": 1 },
                "requirementRefs": {
                  "type": "array",
                  "items": { "type": "string" }
                }
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [x] **Step 8: Create RunPlan schema**

Create `schemas/run-plan.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/run-plan.schema.json",
  "title": "RunPlan",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "runner", "mode", "sourceFlowSpecRef", "scriptPath", "flows"],
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
    "runner": { "type": "string", "enum": ["playwright"] },
    "mode": { "type": "string", "enum": ["mock", "real"] },
    "sourceFlowSpecRef": { "type": "string" },
    "scriptPath": {
      "type": "string",
      "pattern": "^automation/playwright/generated\\.spec\\.ts$"
    },
    "flows": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["flowId", "testCaseId", "title", "entryUrl", "steps", "assertions"],
        "properties": {
          "flowId": { "type": "string" },
          "testCaseId": { "type": "string" },
          "title": { "type": "string" },
          "entryUrl": { "type": "string" },
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "action", "selector", "expected"],
              "properties": {
                "id": { "type": "string" },
                "action": { "type": "string" },
                "selector": { "type": "string", "minLength": 1 },
                "expected": { "type": "string", "minLength": 1 }
              },
              "additionalProperties": false
            }
          },
          "assertions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "layer", "kind", "selector", "expected"],
              "properties": {
                "id": { "type": "string" },
                "layer": { "type": "string", "enum": ["L1", "L2", "L3", "L4", "L5"] },
                "kind": { "type": "string", "enum": ["text", "url", "visibility", "network", "state"] },
                "selector": { "type": "string", "minLength": 1 },
                "expected": { "type": "string", "minLength": 1 }
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [x] **Step 9: Create RunRecord schema**

Create `schemas/run-record.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/run-record.schema.json",
  "title": "RunRecord",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "runId", "runner", "status", "startedAt", "finishedAt", "caseResults", "evidenceFiles"],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": { "type": "string" },
    "feature": { "type": "string" },
    "runId": { "type": "string" },
    "runner": { "type": "string", "enum": ["playwright"] },
    "status": { "type": "string", "enum": ["passed", "failed", "blocked"] },
    "startedAt": { "type": "string" },
    "finishedAt": { "type": "string" },
    "caseResults": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["testCaseId", "status", "assertionResults"],
        "properties": {
          "testCaseId": { "type": "string" },
          "status": { "type": "string", "enum": ["passed", "failed", "skipped", "blocked"] },
          "assertionResults": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["assertionId", "status", "expected"],
              "properties": {
                "assertionId": { "type": "string" },
                "status": { "type": "string", "enum": ["passed", "failed"] },
                "expected": { "type": "string" },
                "actual": { "type": "string" },
                "message": { "type": "string" }
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    },
    "evidenceFiles": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^automation/evidence/[^/]+\\.(txt|json|png|zip)$"
      }
    }
  },
  "additionalProperties": false
}
```

- [x] **Step 10: Create EvidencePack schema**

Create `schemas/evidence-pack.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/evidence-pack.schema.json",
  "title": "EvidencePack",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "runRecordRef", "evidence"],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": { "type": "string" },
    "feature": { "type": "string" },
    "runRecordRef": { "type": "string" },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind", "path", "hash"],
        "properties": {
          "id": { "type": "string" },
          "kind": {
            "type": "string",
            "enum": ["screenshot", "trace", "console", "network", "dom-snapshot", "run-log"]
          },
          "path": {
            "type": "string",
            "pattern": "^automation/evidence/[^/]+\\.(txt|json|png|zip)$"
          },
          "hash": {
            "type": "string",
            "pattern": "^sha256:[a-fA-F0-9]+$"
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [x] **Step 11: Extend closed enum checks**

In `tests/domain.contracts.test.ts`, add these assertions inside `required closed enum constraints are present in JSON Schemas`:

```ts
    expectEnum("FlowSpec", ["properties", "flows", "items", "properties", "surface"], [
      "web",
    ]);
    expectEnum("RunPlan", ["properties", "runner"], ["playwright"]);
    expectEnum("RunPlan", ["properties", "mode"], ["mock", "real"]);
    expectEnum("RunRecord", ["properties", "status"], [
      "passed",
      "failed",
      "blocked",
    ]);
    expectEnum(
      "EvidencePack",
      ["properties", "evidence", "items", "properties", "kind"],
      ["screenshot", "trace", "console", "network", "dom-snapshot", "run-log"],
    );
```

- [x] **Step 12: Extend validator tests for path safety**

Append this test to `tests/domain.validator.test.ts`:

```ts
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
```

- [x] **Step 13: Verify Task 1**

Run:

```bash
bun test tests/automation.contracts.test.ts tests/domain.contracts.test.ts tests/domain.validator.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 14: Commit Task 1**

```bash
git add packages/domain/src/automation.ts packages/domain/src/index.ts packages/domain/src/schemas.ts schemas/ui-script-gen-input.schema.json schemas/flow-spec.schema.json schemas/run-plan.schema.json schemas/run-record.schema.json schemas/evidence-pack.schema.json tests/automation.contracts.test.ts tests/domain.contracts.test.ts tests/domain.validator.test.ts
git commit -m "feat: add automation domain contracts"
```

---

## Task 2: Strict Automation Assertion Policy

**Files:**

- Create: `packages/workflow-engine/src/automation-policy.ts`
- Modify: `packages/workflow-engine/src/gates.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Create: `tests/automation-policy.test.ts`

- [x] **Step 1: Write failing assertion policy tests**

Create `tests/automation-policy.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  GATE_REGISTRY,
  checkAutomationScriptReadiness,
  validateAutomationAssertions,
} from "../packages/workflow-engine/src/index";
import type { TestSpec } from "../packages/domain/src/index";

function baseSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置测试规格",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "M-001",
        name: "规则配置",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "出现保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "ui-copy",
                target: "成功提示",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-001"],
              sourceRefs: ["SRC-001"],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("automation assertion policy", () => {
  test("passes strict web-ready P0 cases with concrete assertions", () => {
    const result = validateAutomationAssertions(baseSpec());
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("blocks ready P0 cases with vague expected text", () => {
    const spec = baseSpec();
    spec.modules[0]!.cases[0]!.assertions[0]!.expected = "验证功能正常";
    const result = validateAutomationAssertions(spec);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.message).toContain("too vague");
  });

  test("blocks non-web automation in v0.2", () => {
    const spec = baseSpec();
    spec.modules[0]!.cases[0]!.automation.surface = "mobile";
    const result = validateAutomationAssertions(spec);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.message).toContain("web-only");
  });

  test("registers automation-script-readiness gate", () => {
    expect(GATE_REGISTRY["automation-script-readiness"]).toBeDefined();
    expect(checkAutomationScriptReadiness(baseSpec()).passed).toBe(true);
  });
});
```

- [x] **Step 2: Run policy tests and verify they fail**

Run:

```bash
bun test tests/automation-policy.test.ts
```

Expected: FAIL because `automation-policy.ts` and `automation-script-readiness` do not exist.

- [x] **Step 3: Implement strict assertion policy**

Create `packages/workflow-engine/src/automation-policy.ts`:

```ts
import type { TestSpec } from "../../domain/src/index";
import type { GateResult, GateViolation } from "./gates";

const VAGUE_EXPECTATIONS = new Set([
  "验证功能正常",
  "正常",
  "成功",
  "符合预期",
  "无异常",
]);

export function validateAutomationAssertions(spec: TestSpec): GateResult {
  const violations: GateViolation[] = [];
  for (const module of spec.modules) {
    for (const testCase of module.cases) {
      const isCritical = testCase.priority === "P0" || testCase.priority === "P1";
      const isReady = testCase.automation.readiness === "ready";
      if (testCase.automation.surface !== "web") {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "v0.2 automation is web-only",
        });
      }
      if (isCritical && isReady && testCase.steps.length === 0) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Ready P0/P1 case must include executable steps",
        });
      }
      if (isCritical && isReady && testCase.assertions.length === 0) {
        violations.push({
          id: testCase.id,
          severity: "error",
          message: "Ready P0/P1 case must include concrete assertions",
        });
      }
      for (const assertion of testCase.assertions) {
        if (VAGUE_EXPECTATIONS.has(assertion.expected.trim())) {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: `Assertion expectation is too vague: ${assertion.expected}`,
          });
        }
        if (assertion.target.trim() === "") {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Assertion target must be concrete",
          });
        }
        if (assertion.requirementRefs.length === 0) {
          violations.push({
            id: assertion.id,
            severity: "error",
            message: "Automation assertion must preserve requirementRefs",
          });
        }
      }
    }
  }
  return {
    passed: violations.every((violation) => violation.severity !== "error"),
    violations,
  };
}
```

- [x] **Step 4: Register automation gate**

In `packages/workflow-engine/src/gates.ts`, import the policy:

```ts
import { validateAutomationAssertions } from "./automation-policy";
```

Add this function before `GATE_REGISTRY`:

```ts
export function checkAutomationScriptReadiness(spec: TestSpec): GateResult {
  const result = validateAutomationAssertions(spec);
  return {
    gateId: "automation-script-readiness",
    passed: result.passed,
    violations: result.violations,
  };
}
```

Add the gate to `GATE_REGISTRY`:

```ts
  "automation-script-readiness": {
    id: "automation-script-readiness",
    checks: [checkAutomationScriptReadiness],
  },
```

- [x] **Step 5: Export automation policy**

In `packages/workflow-engine/src/index.ts`, add:

```ts
export { validateAutomationAssertions } from "./automation-policy";
```

Add `checkAutomationScriptReadiness` to the gates export block:

```ts
  checkAutomationScriptReadiness,
```

- [x] **Step 6: Verify Task 2**

Run:

```bash
bun test tests/automation-policy.test.ts tests/quality-gates.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add packages/workflow-engine/src/automation-policy.ts packages/workflow-engine/src/gates.ts packages/workflow-engine/src/index.ts tests/automation-policy.test.ts
git commit -m "feat: add strict automation assertion policy"
```

---

## Task 3: Automation Artifact Builders

**Files:**

- Modify: `packages/workflow-engine/src/artifact-builders.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Create: `tests/automation-builders.test.ts`

- [x] **Step 1: Write failing builder tests**

Create `tests/automation-builders.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildEvidencePackFromRunRecord,
  buildFlowSpecFromTestSpec,
  buildRunPlanFromFlowSpec,
  renderAutomationReportMarkdown,
} from "../packages/workflow-engine/src/index";
import type {
  ArtifactRef,
  RunRecord,
  TestSpec,
} from "../packages/domain/src/index";

function ref(type: string, path: string): ArtifactRef {
  return {
    id: `${type}:test`,
    type,
    path,
    schemaVersion: "0.1",
    createdBy: "test",
    createdAt: "2026-05-01T00:00:00.000Z",
    hash: "sha256:abc",
  };
}

function testSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置测试规格",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "M-001",
        name: "规则配置",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "出现保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "ui-copy",
                target: "成功提示",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-001"],
              sourceRefs: ["SRC-001"],
            },
          },
        ],
      },
    ],
  };
}

describe("automation artifact builders", () => {
  test("builds FlowSpec from ready TestSpec cases", () => {
    const flow = buildFlowSpecFromTestSpec(ref("TestSpec", "test-spec/test-spec.json"), testSpec());
    expect(flow.project).toBe("demo");
    expect(flow.flows[0]?.surface).toBe("web");
    expect(flow.flows[0]?.testCaseId).toBe("TC-001");
    expect(flow.flows[0]?.assertions[0]?.expected).toBe("保存成功");
  });

  test("builds deterministic RunPlan and generated script", () => {
    const flow = buildFlowSpecFromTestSpec(ref("TestSpec", "test-spec/test-spec.json"), testSpec());
    const { plan, script } = buildRunPlanFromFlowSpec(ref("FlowSpec", "automation/flow-spec.json"), flow, "mock");
    expect(plan.runner).toBe("playwright");
    expect(plan.scriptPath).toBe("automation/playwright/generated.spec.ts");
    expect(script).toContain("test(\"保存规则成功\"");
    expect(script).toContain("await expect");
  });

  test("builds EvidencePack from RunRecord evidence files", () => {
    const record: RunRecord = {
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
    const pack = buildEvidencePackFromRunRecord(ref("RunRecord", "automation/run-record.json"), record);
    expect(pack.evidence[0]?.kind).toBe("run-log");
    expect(pack.evidence[0]?.path).toBe("automation/evidence/run-log.txt");
  });

  test("renders automation report markdown", () => {
    const markdown = renderAutomationReportMarkdown({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      runId: "run-1",
      runner: "playwright",
      status: "failed",
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:00:01.000Z",
      caseResults: [
        {
          testCaseId: "TC-001",
          status: "failed",
          assertionResults: [
            {
              assertionId: "ASSERT-001",
              status: "failed",
              expected: "保存成功",
              actual: "失败",
              message: "toast mismatch",
            },
          ],
        },
      ],
      evidenceFiles: ["automation/evidence/run-log.txt"],
    });
    expect(markdown).toContain("# Automation Report");
    expect(markdown).toContain("TC-001");
    expect(markdown).toContain("toast mismatch");
  });
});
```

- [x] **Step 2: Run builder tests and verify they fail**

Run:

```bash
bun test tests/automation-builders.test.ts
```

Expected: FAIL because automation builder functions do not exist.

- [x] **Step 3: Add automation builders**

Append to `packages/workflow-engine/src/artifact-builders.ts`:

```ts
import { createHash } from "node:crypto";
import type {
  EvidencePack,
  FlowSpec,
  RunMode,
  RunPlan,
  RunRecord,
  TestSpec,
} from "../../domain/src/index";

function selectorFromTarget(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("#") || trimmed.startsWith(".")) {
    return trimmed;
  }
  return `text=${trimmed}`;
}

function flowAssertionKind(kind: string): "text" | "url" | "visibility" | "network" | "state" {
  if (kind.includes("url")) return "url";
  if (kind.includes("network") || kind.includes("api")) return "network";
  if (kind.includes("state")) return "state";
  if (kind.includes("visible") || kind.includes("visibility")) return "visibility";
  return "text";
}

export function buildFlowSpecFromTestSpec(
  testSpecRef: ArtifactRef,
  spec: TestSpec,
): FlowSpec {
  return {
    schemaVersion: "0.1",
    project: spec.project,
    feature: spec.feature,
    sourceTestSpecRef: testSpecRef.id,
    flows: spec.modules.flatMap((module) =>
      module.cases
        .filter((testCase) => testCase.automation.surface === "web")
        .filter((testCase) => testCase.automation.readiness === "ready")
        .map((testCase, index) => ({
          id: `FLOW-${String(index + 1).padStart(3, "0")}`,
          title: testCase.title,
          testCaseId: testCase.id,
          priority: testCase.priority,
          surface: "web" as const,
          entry: { url: `/${spec.feature}` },
          steps: testCase.steps.map((step) => ({
            id: step.id,
            action: step.action,
            target: step.action,
            expected: step.expected,
            assertionRefs: testCase.assertions.map((assertion) => assertion.id),
          })),
          assertions: testCase.assertions.map((assertion) => ({
            id: assertion.id,
            layer: assertion.layer,
            kind: flowAssertionKind(assertion.kind),
            target: assertion.target,
            expected: assertion.expected,
            requirementRefs: assertion.requirementRefs,
          })),
        })),
    ),
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
  const script = [
    "import { expect, test } from '@playwright/test';",
    "",
    ...plan.flows.flatMap((item) => [
      `test(${JSON.stringify(item.title)}, async ({ page }) => {`,
      `  await page.goto(${JSON.stringify(item.entryUrl)});`,
      ...item.steps.map(
        (step) => `  await page.locator(${JSON.stringify(step.selector)}).click();`,
      ),
      ...item.assertions.map(
        (assertion) =>
          `  await expect(page.locator(${JSON.stringify(assertion.selector)})).toContainText(${JSON.stringify(assertion.expected)});`,
      ),
      "});",
      "",
    ]),
  ].join("\n");
  return { plan, script };
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
      id: `EVID-${String(index + 1).padStart(3, "0")}`,
      kind: path.endsWith(".png") ? "screenshot" : "run-log",
      path,
      hash: `sha256:${createHash("sha256").update(path).digest("hex")}`,
    })),
  };
}

export function renderAutomationReportMarkdown(record: RunRecord): string {
  const lines = [
    "# Automation Report",
    "",
    `Run: ${record.runId}`,
    `Status: ${record.status}`,
    "",
    "## Cases",
    ...record.caseResults.flatMap((testCase) => [
      `- ${testCase.testCaseId}: ${testCase.status}`,
      ...testCase.assertionResults.map(
        (assertion) =>
          `  - ${assertion.assertionId}: ${assertion.status}; expected=${assertion.expected}; actual=${assertion.actual ?? ""}; message=${assertion.message ?? ""}`,
      ),
    ]),
    "",
    "## Evidence",
    ...record.evidenceFiles.map((path) => `- ${path}`),
  ];
  return `${lines.join("\n")}\n`;
}
```

- [x] **Step 4: Export automation builders**

In `packages/workflow-engine/src/index.ts`, add these to the `artifact-builders` export block:

```ts
  buildEvidencePackFromRunRecord,
  buildFlowSpecFromTestSpec,
  buildRunPlanFromFlowSpec,
  renderAutomationReportMarkdown,
```

- [x] **Step 5: Verify Task 3**

Run:

```bash
bun test tests/automation-builders.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add packages/workflow-engine/src/artifact-builders.ts packages/workflow-engine/src/index.ts tests/automation-builders.test.ts
git commit -m "feat: add automation artifact builders"
```

---

## Task 4: Playwright Automation Plugin Shell

**Files:**

- Create: `plugins/playwright/package.json`
- Create: `plugins/playwright/plugin.yaml`
- Create: `plugins/playwright/src/mock.ts`
- Create: `tests/playwright-plugin.test.ts`
- Modify: `tests/manifest-references.test.ts`

- [x] **Step 1: Write failing plugin tests**

Create `tests/playwright-plugin.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";
import type { RunPlan } from "../packages/domain/src/index";
import { mockRunPlan } from "../plugins/playwright/src/mock";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runPlan(): RunPlan {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    runner: "playwright",
    mode: "mock",
    sourceFlowSpecRef: "FlowSpec:test",
    scriptPath: "automation/playwright/generated.spec.ts",
    flows: [
      {
        flowId: "FLOW-001",
        testCaseId: "TC-001",
        title: "保存规则成功",
        entryUrl: "/rules",
        steps: [
          {
            id: "STEP-001",
            action: "click",
            selector: "text=保存",
            expected: "保存成功",
          },
        ],
        assertions: [
          {
            id: "ASSERT-001",
            layer: "L3",
            kind: "text",
            selector: "[role=status]",
            expected: "保存成功",
          },
        ],
      },
    ],
  };
}

describe("playwright automation plugin", () => {
  test("mock runner writes run log and returns RunRecord", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const record = await mockRunPlan(runPlan(), {
      rootDir,
      project: "demo",
      feature: "rule-config",
    });
    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    const logPath = join(dir, "automation", "evidence", "run-log.txt");

    expect(record.status).toBe("passed");
    expect(record.caseResults[0]?.testCaseId).toBe("TC-001");
    expect(record.evidenceFiles).toEqual(["automation/evidence/run-log.txt"]);
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, "utf8")).toContain("TC-001 passed");
  });

  test("rejects non-playwright plans", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    await expect(
      mockRunPlan(
        { ...runPlan(), runner: "other" as "playwright" },
        { rootDir, project: "demo", feature: "rule-config" },
      ),
    ).rejects.toThrow("INVALID_INPUT runner must be playwright");
  });
});
```

- [x] **Step 2: Run plugin tests and verify they fail**

Run:

```bash
bun test tests/playwright-plugin.test.ts
```

Expected: FAIL because the Playwright plugin package and mock runner do not exist.

- [x] **Step 3: Create plugin workspace package**

Create `plugins/playwright/package.json`:

```json
{
  "name": "@kata-agent/plugin-playwright",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [x] **Step 4: Create Playwright plugin manifest**

Create `plugins/playwright/plugin.yaml`:

```yaml
name: playwright
title: Playwright Web Automation
version: 0.1.0
type: automation
actions:
  - id: playwright.runPlan
    title: Run Playwright Plan
    inputSchema: RunPlan
    outputSchema: RunRecord
    sideEffects:
      writeArtifacts: true
      external: true
permissions:
  network: restricted
  secrets: []
  writeScopes:
    - feature.automation
```

- [x] **Step 5: Implement deterministic mock runner**

Create `plugins/playwright/src/mock.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { artifactPath } from "../../../packages/artifact-repo/src/index";
import type { RunPlan, RunRecord } from "../../../packages/domain/src/index";
import type { PluginActionContext } from "../../../packages/plugin-runtime/src/index";

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
  const startedAt = new Date().toISOString();
  const evidencePath = "automation/evidence/run-log.txt";
  const logPath = artifactPath(context, evidencePath);
  const caseResults = input.flows.map((flow) => ({
    testCaseId: flow.testCaseId,
    status: "passed" as const,
    assertionResults: flow.assertions.map((assertion) => ({
      assertionId: assertion.id,
      status: "passed" as const,
      expected: assertion.expected,
      actual: assertion.expected,
    })),
  }));
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(
    logPath,
    `${input.flows.map((flow) => `${flow.testCaseId} passed`).join("\n")}\n`,
  );
  return {
    schemaVersion: "0.1",
    project: input.project,
    feature: input.feature,
    runId: `playwright-${Date.now()}`,
    runner: "playwright",
    status: "passed",
    startedAt,
    finishedAt: new Date().toISOString(),
    caseResults,
    evidenceFiles: [evidencePath],
  };
}
```

- [x] **Step 6: Allow automation write scope in Artifact Repository**

In `packages/artifact-repo/src/store.ts`, add this write scope prefix:

```ts
  "feature.automation": ["automation/"],
```

Add a test to `tests/artifact-repo.test.ts`:

```ts
  test("allows automation artifacts only under automation scope", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    expect(() =>
      writeArtifact(
        location,
        "RunPlan",
        "automation/run-plan.json",
        "{}",
        "test",
        { allowedScopes: ["feature.automation"] },
      ),
    ).not.toThrow();
    expect(() =>
      writeArtifact(
        location,
        "RunPlan",
        "reports/run-plan.json",
        "{}",
        "test",
        { allowedScopes: ["feature.automation"] },
      ),
    ).toThrow("FORBIDDEN_WRITE_SCOPE");
  });
```

- [x] **Step 7: Verify plugin manifest refs include Playwright**

Run:

```bash
bun test tests/playwright-plugin.test.ts tests/plugin-runtime.test.ts tests/manifest-references.test.ts tests/artifact-repo.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit Task 4**

```bash
git add plugins/playwright/package.json plugins/playwright/plugin.yaml plugins/playwright/src/mock.ts packages/artifact-repo/src/store.ts tests/playwright-plugin.test.ts tests/artifact-repo.test.ts
git commit -m "feat: add playwright automation plugin shell"
```

---

## Task 5: ui-script-gen Skill And Workflow Manifests

**Files:**

- Create: `skills/ui-script-gen/skill.yaml`
- Create: `workflows/ui-script-gen.yaml`
- Modify: `tests/manifest-references.test.ts`

- [x] **Step 1: Add failing manifest reference assertion for ui-script-gen**

Append this test to `tests/manifest-references.test.ts`:

```ts
  test("ui-script-gen workflow remains web automation only", () => {
    const skill = YAML.parse(readFileSync("skills/ui-script-gen/skill.yaml", "utf8")) as {
      name: string;
      workflow: string;
      requiredPlugins?: string[];
    };
    const workflow = YAML.parse(readFileSync("workflows/ui-script-gen.yaml", "utf8")) as {
      skill: string;
      nodes: Array<{ id: string; type: string; action?: string; gate?: string }>;
    };
    expect(skill.name).toBe("ui-script-gen");
    expect(skill.workflow).toBe("ui-script-gen");
    expect(skill.requiredPlugins).toEqual(["playwright"]);
    expect(workflow.skill).toBe("ui-script-gen");
    expect(workflow.nodes.map((node) => node.id)).toEqual([
      "create-automation-workspace",
      "load-test-spec",
      "build-flow-spec",
      "gate-automation-script-readiness",
      "build-run-plan",
      "execute-run-plan",
      "collect-evidence",
      "write-automation-report",
    ]);
    expect(workflow.nodes.every((node) => node.type !== "branch")).toBe(true);
  });
```

- [x] **Step 2: Run manifest tests and verify they fail**

Run:

```bash
bun test tests/manifest-references.test.ts
```

Expected: FAIL because `skills/ui-script-gen/skill.yaml` and `workflows/ui-script-gen.yaml` do not exist.

- [x] **Step 3: Create ui-script-gen skill manifest**

Create `skills/ui-script-gen/skill.yaml`:

```yaml
name: ui-script-gen
title: UI 自动化脚本生成
version: 0.2.0
description: 从 TestSpec 生成 web-only FlowSpec、RunPlan、Playwright 脚本、RunRecord 和 EvidencePack。
workflow: ui-script-gen
inputs:
  schema: UiScriptGenInput
outputs:
  - FlowSpec
  - RunPlan
  - RunRecord
  - EvidencePack
requiredPlugins:
  - playwright
```

- [x] **Step 4: Create ui-script-gen workflow**

Create `workflows/ui-script-gen.yaml`:

```yaml
id: ui-script-gen
version: 0.2.0
skill: ui-script-gen
nodes:
  - id: create-automation-workspace
    type: artifact
  - id: load-test-spec
    type: artifact
    dependsOn: [create-automation-workspace]
  - id: build-flow-spec
    type: artifact
    dependsOn: [load-test-spec]
  - id: gate-automation-script-readiness
    type: gate
    gate: automation-script-readiness
    dependsOn: [build-flow-spec]
  - id: build-run-plan
    type: artifact
    dependsOn: [gate-automation-script-readiness]
  - id: execute-run-plan
    type: tool
    action: playwright.runPlan
    dependsOn: [build-run-plan]
  - id: collect-evidence
    type: artifact
    dependsOn: [execute-run-plan]
  - id: write-automation-report
    type: artifact
    dependsOn: [collect-evidence]
```

- [x] **Step 5: Verify Task 5**

Run:

```bash
bun test tests/manifest-references.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit Task 5**

```bash
git add skills/ui-script-gen/skill.yaml workflows/ui-script-gen.yaml tests/manifest-references.test.ts
git commit -m "feat: add ui script generation workflow manifests"
```

---

## Task 6: ui-script-gen Runtime Dispatch

**Files:**

- Modify: `packages/workflow-engine/src/types.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Create: `tests/ui-script-gen.runtime.test.ts`

- [x] **Step 1: Write failing ui-script-gen runtime smoke test**

Create `tests/ui-script-gen.runtime.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import { featureDir, writeJsonArtifact } from "../packages/artifact-repo/src/index";
import type { TestSpec } from "../packages/domain/src/index";
import {
  createRuntimeServices,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];
const repoRoot = join(import.meta.dir, "..");

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function loadWorkflow(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(repoRoot, "workflows", "ui-script-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

function testSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置测试规格",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "M-001",
        name: "规则配置",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "出现保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "ui-copy",
                target: "成功提示",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-001"],
              sourceRefs: ["SRC-001"],
            },
          },
        ],
      },
    ],
  };
}

describe("ui-script-gen runtime", () => {
  test("runs mocked web automation from TestSpec to evidence pack", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      testSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );
    const { executor } = createRuntimeServices({ rootDir, mode: "mock" });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "automation-run-1",
      inputs: {
        testSpecPath: "test-spec/test-spec.json",
        mode: "mock",
      },
    });
    const dir = featureDir(location);

    expect(result.state.status).toBe("succeeded");
    for (const path of [
      "automation/flow-spec.json",
      "automation/playwright/run-plan.json",
      "automation/playwright/generated.spec.ts",
      "automation/run-record.json",
      "automation/evidence-pack.json",
      "automation/evidence/run-log.txt",
      "reports/automation-report.md",
      "traces/automation-run-1.jsonl",
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }
    expect(readFileSync(join(dir, "automation/playwright/generated.spec.ts"), "utf8")).toContain(
      "await expect",
    );
    expect(readFileSync(join(dir, "reports/automation-report.md"), "utf8")).toContain(
      "Automation Report",
    );
  });
});
```

- [x] **Step 2: Run runtime smoke and verify it fails**

Run:

```bash
bun test tests/ui-script-gen.runtime.test.ts
```

Expected: FAIL because `WorkflowExecutionContext.inputs`, runtime factory action registration, and executor node dispatch are missing.

- [x] **Step 3: Add workflow execution inputs**

In `packages/workflow-engine/src/executor.ts`, update `WorkflowExecutionContext`:

```ts
export interface WorkflowExecutionContext {
  location: FeatureLocation;
  definition: WorkflowDefinition;
  runId: string;
  sourceUrl?: string;
  inputs?: Record<string, string>;
}
```

If `WorkflowExecutionContext` is also defined or exported from `packages/workflow-engine/src/types.ts` in the current branch, keep the shape identical there.

- [x] **Step 4: Register Playwright action in runtime factory**

In `packages/workflow-engine/src/runtime-factory.ts`, import the mock runner:

```ts
import { mockRunPlan } from "../../../plugins/playwright/src/mock";
```

In mock mode, register the action:

```ts
    actions.register("playwright.runPlan", (input, context) =>
      mockRunPlan(input as RunPlan, context),
    );
```

Add `RunPlan` to the domain type import list:

```ts
  RunPlan,
```

In real mode for v0.2, register an explicit boundary error until a browser-backed runner is introduced:

```ts
    actions.register("playwright.runPlan", () => {
      throw new Error("PLAYWRIGHT_REAL_RUNTIME_NOT_IMPLEMENTED");
    });
```

This keeps real provider/Lanhu/XMind behavior intact while making the web automation runtime boundary explicit and tested.

- [x] **Step 5: Add ui-script-gen node dispatch**

In `packages/workflow-engine/src/executor.ts`, import automation types:

```ts
  EvidencePack,
  FlowSpec,
  RunMode,
  RunPlan,
  RunRecord,
```

Import builders and policy:

```ts
  buildEvidencePackFromRunRecord,
  buildFlowSpecFromTestSpec,
  buildRunPlanFromFlowSpec,
  renderAutomationReportMarkdown,
```

Add helper functions inside `run` after `writeJson`:

```ts
    const inputValue = (name: string): string => {
      const value = context.inputs?.[name];
      if (!value) throw new Error(`Missing workflow input: ${name}`);
      return value;
    };
    const modeValue = (): RunMode => {
      const value = context.inputs?.mode ?? "mock";
      if (value !== "mock" && value !== "real") {
        throw new Error(`Invalid ui-script-gen mode: ${value}`);
      }
      return value;
    };
```

Add these cases to the dispatch switch:

```ts
          case "create-automation-workspace": {
            createFeatureWorkspace(context.location);
            break;
          }
          case "load-test-spec": {
            const path = inputValue("testSpecPath");
            const indexRef = readArtifactIndex(context.location).artifacts.find(
              (item) => item.type === "TestSpec" && item.path === path,
            );
            if (!indexRef) throw new Error(`Missing TestSpec artifact: ${path}`);
            remember(indexRef);
            values.set(
              "TestSpec",
              readJsonArtifact<TestSpec>(context.location, indexRef, "TestSpec"),
            );
            break;
          }
          case "build-flow-spec": {
            const output = buildFlowSpecFromTestSpec(
              refFor("TestSpec"),
              valueFor<TestSpec>("TestSpec"),
            );
            writtenRefs.push(
              writeJson("FlowSpec", "automation/flow-spec.json", output, [
                "feature.automation",
              ]),
            );
            break;
          }
          case "gate-automation-script-readiness": {
            const result = checkAutomationScriptReadiness(
              valueFor<TestSpec>("TestSpec"),
            );
            gateResults.push(result);
            appendTrace(dir, {
              runId: context.runId,
              nodeId: node.id,
              type: result.passed ? "gate-passed" : "gate-failed",
              gateId: result.gateId,
              at: new Date().toISOString(),
              details: { violations: result.violations },
            });
            if (!result.passed) {
              state = markBlocked(state, node.id, "automation-script-readiness");
              saveWorkflowState(dir, state);
              return { state };
            }
            break;
          }
          case "build-run-plan": {
            const rendered = buildRunPlanFromFlowSpec(
              refFor("FlowSpec"),
              valueFor<FlowSpec>("FlowSpec"),
              modeValue(),
            );
            writtenRefs.push(
              writeJson(
                "RunPlan",
                "automation/playwright/run-plan.json",
                rendered.plan,
                ["feature.automation"],
              ),
            );
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "PlaywrightScript",
                  rendered.plan.scriptPath,
                  rendered.script,
                  "workflow-executor",
                  { allowedScopes: ["feature.automation"] },
                ),
              ),
            );
            break;
          }
          case "execute-run-plan": {
            const output = (await this.services.actions.execute(
              "playwright.runPlan",
              valueFor<RunPlan>("RunPlan"),
              actionContext,
            )) as RunRecord;
            writtenRefs.push(
              writeJson("RunRecord", "automation/run-record.json", output, [
                "feature.automation",
              ]),
            );
            break;
          }
          case "collect-evidence": {
            const output = buildEvidencePackFromRunRecord(
              refFor("RunRecord"),
              valueFor<RunRecord>("RunRecord"),
            );
            writtenRefs.push(
              writeJson("EvidencePack", "automation/evidence-pack.json", output, [
                "feature.automation",
              ]),
            );
            break;
          }
          case "write-automation-report": {
            writtenRefs.push(
              remember(
                writeArtifact(
                  context.location,
                  "AutomationReportMarkdown",
                  "reports/automation-report.md",
                  renderAutomationReportMarkdown(valueFor<RunRecord>("RunRecord")),
                  "workflow-executor",
                  { allowedScopes: ["feature.reports"] },
                ),
              ),
            );
            break;
          }
```

Add `checkAutomationScriptReadiness` to the gates import.

- [x] **Step 6: Verify Task 6**

Run:

```bash
bun test tests/ui-script-gen.runtime.test.ts tests/workflow-executor.test.ts tests/runtime-factory.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit Task 6**

```bash
git add packages/workflow-engine/src/executor.ts packages/workflow-engine/src/runtime-factory.ts tests/ui-script-gen.runtime.test.ts
git commit -m "feat: run ui script generation workflow"
```

---

## Task 7: CLI Entry For ui-script-gen

**Files:**

- Modify: `apps/cli/src/index.ts`
- Create: `tests/ui-script-gen.cli.test.ts`

- [x] **Step 1: Write failing CLI test**

Create `tests/ui-script-gen.cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir, writeJsonArtifact } from "../packages/artifact-repo/src/index";
import type { TestSpec } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function testSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置测试规格",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "M-001",
        name: "规则配置",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "出现保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "ui-copy",
                target: "成功提示",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-001"],
              sourceRefs: ["SRC-001"],
            },
          },
        ],
      },
    ],
  };
}

describe("ui-script-gen CLI", () => {
  test("starts web automation workflow and prints run status", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      testSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "ui-script-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--test-spec",
        "test-spec/test-spec.json",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    const parsed = JSON.parse(output) as { status: string; currentNode: string };
    expect(parsed.status).toBe("succeeded");
    expect(parsed.currentNode).toBe("write-automation-report");

    const dir = featureDir(location);
    expect(existsSync(join(dir, "automation", "evidence-pack.json"))).toBe(true);
    expect(readFileSync(join(dir, "reports", "automation-report.md"), "utf8")).toContain(
      "Automation Report",
    );
  });
});
```

- [x] **Step 2: Run CLI test and verify it fails**

Run:

```bash
bun test tests/ui-script-gen.cli.test.ts
```

Expected: FAIL because the CLI does not recognize `ui-script-gen`.

- [x] **Step 3: Add workflow loader with workflow name**

In `apps/cli/src/index.ts`, replace `loadWorkflowDefinition` with:

```ts
function loadWorkflowDefinition(name = "test-case-gen"): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(process.cwd(), "workflows", `${name}.yaml`), "utf8"),
  ) as WorkflowDefinition;
}
```

- [x] **Step 4: Add ui-script-gen help text**

Change the help command output to:

```ts
    "kata-agent commands: test-case-gen, ui-script-gen, workflow status, workflow resume, confirmation import, knowledge suggestions",
```

- [x] **Step 5: Add ui-script-gen command**

Add this block before `workflow status`:

```ts
if (command === "ui-script-gen") {
  const rootDir = requireArg("--root");
  const project = requireArg("--project");
  const feature = requireArg("--feature");
  const testSpecPath = requireArg("--test-spec");
  const runId = argValue("--run") ?? randomUUID();
  const { executor } = createRuntimeServices({ rootDir, mode: runtimeMode() });
  const result = await executor.start({
    location: { rootDir, project, feature },
    definition: loadWorkflowDefinition("ui-script-gen"),
    runId,
    inputs: {
      testSpecPath,
      mode: runtimeMode(),
    },
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
```

- [x] **Step 6: Verify Task 7**

Run:

```bash
bun test tests/ui-script-gen.cli.test.ts tests/cli.smoke.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit Task 7**

```bash
git add apps/cli/src/index.ts tests/ui-script-gen.cli.test.ts
git commit -m "feat: expose ui script generation cli"
```

---

## Task 8: Foundation Integration Smoke For v0.2

**Files:**

- Create: `tests/automation-foundation-smoke.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write v0.2 foundation smoke**

Create `tests/automation-foundation-smoke.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir, writeJsonArtifact } from "../packages/artifact-repo/src/index";
import type { TestSpec } from "../packages/domain/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function smokeSpec(): TestSpec {
  return {
    schemaVersion: "0.1",
    project: "demo",
    feature: "rule-config",
    title: "规则配置测试规格",
    requirementRef: "requirement/spec/requirement-spec.json",
    status: "reviewed",
    modules: [
      {
        id: "M-001",
        name: "规则配置",
        requirementRefs: ["REQ-001"],
        cases: [
          {
            id: "TC-001",
            title: "保存规则成功",
            priority: "P0",
            requirementRefs: ["REQ-001"],
            steps: [
              {
                id: "STEP-001",
                action: "点击保存按钮",
                expected: "出现保存成功提示",
                requirementRefs: ["REQ-001"],
              },
            ],
            assertions: [
              {
                id: "ASSERT-001",
                layer: "L3",
                kind: "ui-copy",
                target: "成功提示",
                expected: "保存成功",
                requirementRefs: ["REQ-001"],
              },
            ],
            automation: {
              surface: "web",
              readiness: "ready",
              uiContractRefs: ["PAGE-001"],
              blockers: [],
            },
            traceability: {
              requirementRefs: ["REQ-001"],
              sourceRefs: ["SRC-001"],
            },
          },
        ],
      },
    ],
  };
}

describe("v0.2 automation foundation smoke", () => {
  test("CLI produces automation artifacts without external credentials or browsers", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    writeJsonArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      smokeSpec(),
      "test",
      { allowedScopes: ["feature.test-spec"] },
    );

    const proc = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "ui-script-gen",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--test-spec",
        "test-spec/test-spec.json",
        "--root",
        rootDir,
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    expect(await proc.exited, error).toBe(0);
    expect(JSON.parse(output).status).toBe("succeeded");

    const dir = featureDir(location);
    const index = readFileSync(join(dir, "artifact-index.json"), "utf8");
    expect(index).toContain("FlowSpec");
    expect(index).toContain("RunPlan");
    expect(index).toContain("RunRecord");
    expect(index).toContain("EvidencePack");
    expect(readFileSync(join(dir, "traces", `${JSON.parse(output).runId}.jsonl`), "utf8")).toContain(
      "playwright.runPlan",
    );
    expect(existsSync(join(dir, "automation", "playwright", "generated.spec.ts"))).toBe(true);
  });
});
```

- [x] **Step 2: Run smoke test and verify it passes**

Run:

```bash
bun test tests/automation-foundation-smoke.test.ts
```

Expected: PASS.

- [x] **Step 3: Document v0.2 command in README**

Append this section to `README.md`:

````md
## v0.2 Web Automation

`ui-script-gen` consumes an existing `test-spec/test-spec.json` artifact and produces web-only automation artifacts:

- `automation/flow-spec.json`
- `automation/playwright/run-plan.json`
- `automation/playwright/generated.spec.ts`
- `automation/run-record.json`
- `automation/evidence-pack.json`
- `reports/automation-report.md`

Run the mocked automation foundation from the repository root:

```sh
bun apps/cli/src/index.ts ui-script-gen --project <project> --feature <feature> --test-spec test-spec/test-spec.json --root .
```

v0.2 does not run mobile or desktop automation.
````

- [x] **Step 4: Verify Task 8**

Run:

```bash
bun test tests/automation-foundation-smoke.test.ts
bun run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit Task 8**

```bash
git add README.md tests/automation-foundation-smoke.test.ts
git commit -m "docs: add v0.2 automation smoke"
```

---

## Task 9: Full Verification

**Files:**

- No production files.

- [x] **Step 1: Run all tests**

Run:

```bash
bun test
```

Expected: all tests pass.

- [x] **Step 2: Run TypeScript check**

Run:

```bash
bun run typecheck
```

Expected: no TypeScript errors.

- [x] **Step 3: Run source scan**

Run:

```bash
rg -n "Capability|MindMapExport|Archive|integration|type: branch|type: knowledge|type: parallel|type: merge" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```

Expected: no active contract drift in checked source, tests, manifests, package metadata, or README.

- [x] **Step 4: Run secret/path scan**

Run:

```bash
rg -n "LANHU_COOKIE=|Bearer [A-Za-z0-9]|https://[^ ]*internal|/Users/|/private/" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```

Expected: no hardcoded secrets, internal URLs, or local absolute paths.

- [x] **Step 5: Check all workspace packages**

Run:

```bash
find apps packages plugins -mindepth 2 -maxdepth 2 -name package.json -print | sort
```

Expected output includes:

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
plugins/playwright/package.json
plugins/xmind/package.json
```

- [x] **Step 6: Commit verification updates if needed**

If verification required test or docs changes:

```bash
git add README.md apps packages plugins schemas tests workflows skills docs/superpowers/plans
git commit -m "test: verify v0.2 automation foundation"
```

If verification required no changes:

```bash
git status --short
```

Expected: no uncommitted implementation changes from v0.2 tasks.

---

## Self-Review

Spec coverage:

- `FlowSpec`, `RunPlan`, `RunRecord`, `EvidencePack`: Task 1.
- Playwright surface plugin: Task 4.
- Script generation from `TestSpec`: Task 3 and Task 6.
- Strict assertion policy with L1-L5 assertion layers: Task 2 and Task 3.
- Failure-to-report bridge into future report-gen: Task 6 writes `reports/automation-report.md` from `RunRecord`; full `report-gen` remains v0.3.
- Web-only repeatable automation success: Task 6, Task 7, and Task 8.
- No mobile/desktop automation: Task 1 schema closes surface to `web`; Task 2 blocks non-web surfaces.
- Workflow Engine remains sole flow controller: Task 5 workflow and Task 6 executor dispatch keep the linear graph inside the Workflow Engine.
- Plugin/action/gate/schema manifest refs: Task 4, Task 5, and existing manifest-reference tests.

Placeholder scan:

- No unresolved placeholder markers are present.
- Every code-changing task has concrete code snippets and exact verification commands.

Type consistency:

- Schema names match `SCHEMA_REGISTRY`: `UiScriptGenInput`, `FlowSpec`, `RunPlan`, `RunRecord`, `EvidencePack`.
- Workflow action id is consistently `playwright.runPlan`.
- Gate id is consistently `automation-script-readiness`.
- Skill name and workflow id are consistently `ui-script-gen`.
