# kata-agent v0.1b Runtime Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `test-case-gen` run end-to-end with deterministic mocks from requirement source through human confirmation import, `RequirementSpec`, `TestSpec`, mocked XMind export, knowledge suggestion, and design report.

**Architecture:** Keep Workflow Engine as the only flow controller. The executor dispatches the existing core node types (`artifact`, `tool`, `agent`, `gate`, `human`) and delegates to Agent Runner, Plugin Runtime, Artifact Repository, Knowledge Repository, and gate functions. v0.1b uses mock provider/actions and Ajv validation; real Lanhu, real XMind, and real model providers remain v0.1c.

**Tech Stack:** TypeScript, Bun test runner, Ajv JSON Schema validation, YAML manifests, file-backed workflow state and artifacts.

---

## File Structure

- `packages/domain/src/validator.ts` — Ajv-backed schema validator using `SCHEMA_REGISTRY`.
- `packages/artifact-repo/src/validation.ts` — validated artifact read/write helpers.
- `packages/plugin-runtime/src/action-registry.ts` — in-memory plugin action handler registry.
- `plugins/lanhu/src/mock.ts` — deterministic `lanhu.fetchRequirement` mock action.
- `plugins/xmind/src/mock.ts` — deterministic `xmind.export` mock action.
- `packages/knowledge-repo/src/actions.ts` — built-in `knowledge.consult` / `knowledge.propose` handlers.
- `packages/agent-runner/src/agent-runner.ts` — prompt render, provider call, JSON parse, schema validate.
- `packages/workflow-engine/src/artifact-builders.ts` — wrapper artifact builders and Markdown/design renderers.
- `packages/workflow-engine/src/executor.ts` — persisted workflow executor and resume loop.
- `apps/cli/src/index.ts` — `test-case-gen`, `workflow resume`, and stronger `workflow status`.
- `tests/fixtures/poor-prd.json` — deterministic poor PRD fixture.
- `tests/runtime-loop.test.ts` — end-to-end mocked runtime loop.

## Task 0: Fix Foundation Contract Drift

**Files:**

- Modify: `schemas/workflow-definition.schema.json`
- Modify: `tests/domain.contracts.test.ts`
- Modify: `workflows/test-case-gen.yaml`
- Modify: `packages/artifact-repo/src/store.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `tests/cli.smoke.test.ts`
- Test: `tests/domain.contracts.test.ts`
- Test: `tests/manifest-references.test.ts`
- Test: `tests/cli.smoke.test.ts`

- [ ] **Step 1: Make `WorkflowDefinition.nodes` an array schema**

Replace `schemas/workflow-definition.schema.json` with:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/workflow-definition.schema.json",
  "title": "WorkflowDefinition",
  "type": "object",
  "required": ["id", "version", "skill", "nodes"],
  "properties": {
    "id": { "type": "string" },
    "version": { "type": "string" },
    "skill": { "type": "string" },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type"],
        "properties": {
          "id": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["tool", "agent", "gate", "human", "artifact"]
          },
          "action": { "type": "string" },
          "agent": { "type": "string" },
          "gate": { "type": "string" },
          "dependsOn": {
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
```

- [ ] **Step 2: Add schema drift assertion**

In `tests/domain.contracts.test.ts`, add:

```ts
test("workflow definition schema matches workflow yaml shape", () => {
  const schema = readSchema(SCHEMA_REGISTRY.WorkflowDefinition);
  expect(schema.properties?.nodes?.type).toBe("array");
  expect(schema.properties?.nodes?.items?.properties?.type?.enum).toEqual([
    "tool",
    "agent",
    "gate",
    "human",
    "artifact",
  ]);
});
```

- [ ] **Step 3: Make analysis dependency explicit**

In `workflows/test-case-gen.yaml`, change:

```yaml
dependsOn: [consult-knowledge]
```

for `analyze-requirement-gaps` to:

```yaml
dependsOn: [normalize-requirement-source, consult-knowledge]
```

- [ ] **Step 4: Preserve artifact index identity from CLI import**

Add a `writeArtifactInFeatureDir` option that can preserve feature identity when callers only have a feature directory:

```ts
export interface WriteArtifactOptions {
  allowedScopes?: string[];
  project?: string;
  feature?: string;
}
```

In `apps/cli/src/index.ts`, pass `--project` and `--feature` when provided:

```ts
const project = argValue("--project");
const feature = argValue("--feature");
const ref = writeArtifactInFeatureDir(
  featureDir,
  "ConfirmationResult",
  "requirement/confirmed/confirmation-result.json",
  rawConfirmation,
  "confirmation import",
  {
    allowedScopes: ["feature.requirement.confirmed"],
    project,
    feature,
  },
);
```

Extend `tests/cli.smoke.test.ts` to call `confirmation import` with `--project demo --feature rule-config` and assert `artifact-index.json` contains `"project": "demo"` and `"feature": "rule-config"`.

- [ ] **Step 5: Verify foundation drift fixes**

Run: `bun test tests/domain.contracts.test.ts tests/manifest-references.test.ts`

Expected: PASS.

Run: `bun test tests/cli.smoke.test.ts`

Expected: PASS.

## Task 1: Ajv Schema Validation Service

**Files:**

- Create: `packages/domain/src/validator.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain.validator.test.ts`

- [ ] **Step 1: Create validator**

`packages/domain/src/validator.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import { SCHEMA_REGISTRY, type SchemaName } from "./schemas";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<SchemaName, ValidateFunction>();

function repoRoot(): string {
  return join(import.meta.dir, "..", "..", "..");
}

export function getSchemaValidator(name: SchemaName): ValidateFunction {
  const existing = validators.get(name);
  if (existing) return existing;
  const schemaPath = join(repoRoot(), SCHEMA_REGISTRY[name]);
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validator = ajv.compile(schema);
  validators.set(name, validator);
  return validator;
}

export function validateSchema(
  name: SchemaName,
  value: unknown,
): SchemaValidationResult {
  const validate = getSchemaValidator(name);
  const valid = validate(value);
  return {
    valid,
    errors: (validate.errors ?? []).map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
    ),
  };
}

export function assertValidSchema(name: SchemaName, value: unknown): void {
  const result = validateSchema(name, value);
  if (!result.valid) {
    throw new Error(`SCHEMA_VALIDATION_FAILED ${name}: ${result.errors.join("; ")}`);
  }
}
```

- [ ] **Step 2: Export validator**

Add to `packages/domain/src/index.ts`:

```ts
export {
  assertValidSchema,
  getSchemaValidator,
  validateSchema,
  type SchemaValidationResult,
} from "./validator";
```

- [ ] **Step 3: Add validator tests**

`tests/domain.validator.test.ts`:

```ts
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
    expect(result.errors.join("\n")).toContain("must be equal to one of the allowed values");
  });
});
```

- [ ] **Step 4: Verify validator**

Run: `bun test tests/domain.validator.test.ts`

Expected: PASS.

## Task 2: Validated Artifact Read And Write

**Files:**

- Create: `packages/artifact-repo/src/validation.ts`
- Modify: `packages/artifact-repo/src/index.ts`
- Test: `tests/artifact-validation.test.ts`

- [ ] **Step 1: Add validated helpers**

`packages/artifact-repo/src/validation.ts`:

```ts
import type { SchemaName } from "../../domain/src/index";
import { assertValidSchema } from "../../domain/src/index";
import type { ArtifactRef } from "../../domain/src/index";
import type { FeatureLocation, WriteArtifactOptions } from "./index";
import { readArtifactVerified, writeArtifact } from "./store";

export function writeJsonArtifact<T>(
  location: FeatureLocation,
  schemaName: SchemaName,
  relativePath: string,
  value: T,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  assertValidSchema(schemaName, value);
  return writeArtifact(
    location,
    schemaName,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`,
    createdBy,
    options,
  );
}

export function readJsonArtifact<T>(
  location: FeatureLocation,
  ref: ArtifactRef,
  schemaName: SchemaName,
): T {
  const value = JSON.parse(readArtifactVerified(location, ref)) as T;
  assertValidSchema(schemaName, value);
  return value;
}
```

- [ ] **Step 2: Export helpers**

Add to `packages/artifact-repo/src/index.ts`:

```ts
export { readJsonArtifact, writeJsonArtifact } from "./validation";
```

- [ ] **Step 3: Add tests**

`tests/artifact-validation.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  readJsonArtifact,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { RequirementDraft } from "../packages/domain/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("validated artifact helpers", () => {
  test("validates before write and after read", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const draft: RequirementDraft = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      facts: [],
    };
    const ref = writeJsonArtifact(
      location,
      "RequirementDraft",
      "requirement/drafts/requirement-draft.json",
      draft,
      "test",
      { allowedScopes: ["feature.requirement.drafts"] },
    );
    expect(readJsonArtifact<RequirementDraft>(location, ref, "RequirementDraft").title).toBe("规则配置");
  });
});
```

- [ ] **Step 4: Verify artifact validation**

Run: `bun test tests/artifact-validation.test.ts`

Expected: PASS.

## Task 3: Mock Action Registry And Built-In Knowledge Actions

**Files:**

- Create: `packages/plugin-runtime/src/action-registry.ts`
- Modify: `packages/plugin-runtime/src/index.ts`
- Create: `packages/knowledge-repo/src/actions.ts`
- Modify: `packages/knowledge-repo/src/index.ts`
- Create: `plugins/lanhu/src/mock.ts`
- Create: `plugins/xmind/src/mock.ts`
- Test: `tests/action-registry.test.ts`

- [ ] **Step 1: Add action registry**

`packages/plugin-runtime/src/action-registry.ts`:

```ts
export interface PluginActionContext {
  rootDir: string;
  project: string;
  feature: string;
}

export type PluginActionHandler = (
  input: unknown,
  context: PluginActionContext,
) => Promise<unknown> | unknown;

export class PluginActionRegistry {
  private readonly handlers = new Map<string, PluginActionHandler>();

  register(actionId: string, handler: PluginActionHandler): void {
    if (this.handlers.has(actionId)) throw new Error(`Action already registered: ${actionId}`);
    this.handlers.set(actionId, handler);
  }

  async execute(
    actionId: string,
    input: unknown,
    context: PluginActionContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(actionId);
    if (!handler) throw new Error(`Action not registered: ${actionId}`);
    return handler(input, context);
  }
}
```

- [ ] **Step 2: Export action registry**

Add to `packages/plugin-runtime/src/index.ts`:

```ts
export {
  PluginActionRegistry,
  type PluginActionContext,
  type PluginActionHandler,
} from "./action-registry";
```

- [ ] **Step 3: Add built-in knowledge actions**

`packages/knowledge-repo/src/actions.ts`:

```ts
import type {
  KnowledgeConsultResult,
  KnowledgeSuggestion,
  RequirementDraft,
  RequirementSpec,
} from "../../domain/src/index";
import { writeSuggestion } from "./store";

export function consultKnowledge(input: RequirementDraft): KnowledgeConsultResult {
  return {
    schemaVersion: "0.1",
    query: input.title,
    snippets: [],
  };
}

export function proposeKnowledge(
  input: RequirementSpec,
  rootDir: string,
): KnowledgeSuggestion[] {
  const suggestions = input.rules
    .filter((rule) => rule.sourceType === "confirmation")
    .map((rule): KnowledgeSuggestion => ({
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/spec/requirement-spec.json",
      content: rule.text,
      targetCategory: "decisions",
      reason: "confirmed requirement rule",
    }));
  for (const suggestion of suggestions) {
    writeSuggestion({ rootDir, project: input.project }, suggestion);
  }
  return suggestions;
}
```

- [ ] **Step 4: Add mock plugin handlers**

`plugins/lanhu/src/mock.ts`:

```ts
import type { LanhuFetchInput, RequirementSourceBundle } from "../../../packages/domain/src/index";

export function mockFetchRequirement(input: LanhuFetchInput): RequirementSourceBundle {
  return {
    schemaVersion: "0.1",
    sourceType: "lanhu",
    sourceUrl: input.url,
    title: "规则配置",
    textBlocks: [
      {
        id: "SRC-001",
        title: "原始需求",
        content: "用户需要创建规则，但缺少保存按钮文案和成功提示。",
      },
    ],
    images: [],
    rawFiles: [],
    fetchedAt: "2026-05-01T00:00:00.000Z",
  };
}
```

`plugins/xmind/src/mock.ts`:

```ts
import type { TestSpec, XMindExport } from "../../../packages/domain/src/index";

export function mockExportXMind(input: TestSpec): XMindExport {
  const caseCount = input.modules.reduce(
    (total, module) => total + module.cases.length,
    0,
  );
  return {
    schemaVersion: "0.1",
    outputPath: "exports/xmind/test-spec.xmind",
    caseCount,
  };
}
```

- [ ] **Step 5: Verify action registry**

Run: `bun test tests/action-registry.test.ts`

Expected: PASS.

## Task 4: AgentRunner Mock Runtime

**Files:**

- Modify: `packages/agent-runner/src/agent-runner.ts`
- Test: `tests/agent-runner.runtime.test.ts`

- [ ] **Step 1: Implement provider-backed JSON output**

Replace `AgentRunner.run` with:

```ts
import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";

export class AgentRunner {
  constructor(private readonly providers: ProviderRegistry) {}

  async run(agent: AgentManifest, input: unknown, prompt = ""): Promise<AgentResponse> {
    const provider = this.providers.select({
      ...agent.providerHints,
      needs: [...(agent.providerHints?.needs ?? []), "structuredOutput"],
    });
    const response = await provider.generate({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(input) },
      ],
      responseFormat: { schema: agent.outputSchema },
      metadata: { agent: agent.name, outputSchema: agent.outputSchema },
    });
    return {
      output: JSON.parse(response.content) as unknown,
      providerId: provider.id,
      usage: response.usage,
    };
  }
}
```

- [ ] **Step 2: Add runtime test**

`tests/agent-runner.runtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../packages/agent-runner/src/index";

describe("agent runner runtime", () => {
  test("calls selected provider and parses JSON output", async () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ "source-normalizer": "{\"schemaVersion\":\"0.1\",\"ok\":true}" }));
    const runner = new AgentRunner(registry);
    const agent: AgentManifest = {
      name: "source-normalizer",
      title: "source",
      version: "0.1.0",
      inputSchema: "RequirementSourceBundle",
      outputSchema: "RequirementDraft",
      ownerSkill: "test-case-gen",
      promptPath: "prompt.md",
    };
    const result = await runner.run(agent, { input: true }, "# 角色");
    expect(result.providerId).toBe("mock");
    expect(result.output).toEqual({ schemaVersion: "0.1", ok: true });
  });
});
```

- [ ] **Step 3: Verify agent runtime**

Run: `bun test tests/agent-runner.runtime.test.ts`

Expected: PASS.

## Task 5: Workflow Artifact Builders

**Files:**

- Create: `packages/workflow-engine/src/artifact-builders.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Test: `tests/artifact-builders.test.ts`

- [ ] **Step 1: Add wrapper builders and renderers**

`packages/workflow-engine/src/artifact-builders.ts`:

```ts
import type {
  ClarificationDossier,
  ConfirmationDraft,
  DesignReport,
  RequirementAnalysisInput,
  RequirementAuthorInput,
  TestSpecAuthorInput,
  TestSpecReviewerInput,
} from "../../domain/src/index";
import type { ArtifactRef } from "../../domain/src/index";
import type { GateResult } from "./gates";
import type { TraceEvent } from "./types";

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

export function renderConfirmationDraft(
  dossierRef: ArtifactRef,
  dossier: ClarificationDossier,
): { draft: ConfirmationDraft; markdown: string } {
  const lines = [
    "# 需求澄清确认",
    "",
    dossier.summary,
    "",
    ...dossier.questions.map((question) => `- [${question.severity}] ${question.id}: ${question.question}`),
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
```

- [ ] **Step 2: Export builders**

Add exports from `packages/workflow-engine/src/index.ts`.

- [ ] **Step 3: Verify builders**

Run: `bun test tests/artifact-builders.test.ts`

Expected: PASS.

## Task 6: Workflow Executor

**Files:**

- Create: `packages/workflow-engine/src/executor.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Test: `tests/workflow-executor.test.ts`

- [ ] **Step 1: Define executor contracts**

`packages/workflow-engine/src/executor.ts` starts with:

```ts
import type { AgentManifest } from "../../agent-runner/src/index";
import type { AgentRunner } from "../../agent-runner/src/index";
import type { FeatureLocation } from "../../artifact-repo/src/index";
import type { PluginActionRegistry } from "../../plugin-runtime/src/index";
import type { WorkflowDefinition, WorkflowRunState } from "./types";

export interface WorkflowExecutorServices {
  agentRunner: AgentRunner;
  actions: PluginActionRegistry;
  agents: Map<string, AgentManifest>;
}

export interface WorkflowExecutionContext {
  location: FeatureLocation;
  definition: WorkflowDefinition;
  runId: string;
}

export interface WorkflowExecutionResult {
  state: WorkflowRunState;
}
```

- [ ] **Step 2: Implement `WorkflowExecutor.start` and `resume`**

The executor must:

- create or load state
- skip succeeded nodes
- run ready nodes in dependency order
- stop at `human` nodes by marking `waiting`
- append `enter` and `exit` trace events for each executed node
- write every node output through Artifact Repository
- run gate checks before `export-xmind`
- never let agents, plugins, or CLI branch the flow

Use this public class shape:

```ts
export class WorkflowExecutor {
  constructor(private readonly services: WorkflowExecutorServices) {}

  async start(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    return this.run(context);
  }

  async resume(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    return this.run(context);
  }

  private async run(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    throw new Error("WorkflowExecutor.run implementation is completed in Task 6 Step 3");
  }
}
```

- [ ] **Step 3: Complete dispatch implementation**

Replace the temporary throw with node dispatch for:

- `create-feature-workspace`
- `ingest-requirement-source`
- `normalize-requirement-source`
- `consult-knowledge`
- `analyze-requirement-gaps`
- `draft-clarification-dossier`
- `render-confirmation-draft`
- `await-confirmation-result`
- `author-requirement-spec`
- `design-test-points`
- `author-test-spec`
- `review-test-spec`
- `gate-readiness`
- `export-xmind`
- `propose-knowledge`
- `write-design-report`

The implementation may use an internal `Map<string, ArtifactRef>` keyed by schema name for v0.1b. It must persist `.state/{runId}.json` after each node.

- [ ] **Step 4: Verify executor stops at human gate**

Run: `bun test tests/workflow-executor.test.ts`

Expected: PASS, including a test where the run reaches `await-confirmation-result` and persists `waiting`.

## Task 7: CLI Start And Resume

**Files:**

- Modify: `apps/cli/src/index.ts`
- Test: `tests/cli.runtime.test.ts`

- [ ] **Step 1: Add `test-case-gen` start**

The command:

```bash
bun apps/cli/src/index.ts test-case-gen --project demo --feature rule-config --source-url mock://poor-prd --root <tmp>
```

must:

- load `workflows/test-case-gen.yaml`
- register mock Lanhu and XMind actions
- register built-in knowledge actions
- register mock provider responses for all seven agents
- start `WorkflowExecutor`
- print `{ runId, status, currentNode }` as JSON

- [ ] **Step 2: Add `workflow resume`**

The command:

```bash
bun apps/cli/src/index.ts workflow resume --feature-dir <featureDir> --run <runId>
```

must reload the workflow definition and continue after imported confirmation.

- [ ] **Step 3: Verify CLI runtime**

Run: `bun test tests/cli.runtime.test.ts`

Expected: PASS.

## Task 8: Knowledge Keeper Minimal Commands

**Files:**

- Modify: `packages/knowledge-repo/src/store.ts`
- Modify: `apps/cli/src/index.ts`
- Test: `tests/knowledge-keeper-cli.test.ts`

- [ ] **Step 1: Add suggestion listing**

Add:

```ts
export function listSuggestions(location: KnowledgeLocation): string[] {
  const dir = join(knowledgeDir(location), "suggestions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => join(dir, entry))
    .sort();
}
```

- [ ] **Step 2: Add CLI search/list command**

Add:

```bash
kata-agent knowledge suggestions --root <root> --project <project>
```

It prints JSON array of suggestion paths.

- [ ] **Step 3: Verify knowledge command**

Run: `bun test tests/knowledge-keeper-cli.test.ts`

Expected: PASS.

## Task 9: End-To-End Mock Runtime Smoke

**Files:**

- Create: `tests/fixtures/poor-prd.json`
- Create: `tests/runtime-loop.test.ts`

- [ ] **Step 1: Add poor PRD fixture**

`tests/fixtures/poor-prd.json`:

```json
{
  "url": "mock://poor-prd",
  "title": "规则配置",
  "content": "用户需要创建规则，但缺少保存按钮文案、成功提示、权限边界和异常处理。"
}
```

- [ ] **Step 2: Add e2e mocked runtime test**

The test must:

1. start `test-case-gen`
2. assert status is `waiting` at `await-confirmation-result`
3. write confirmation JSON
4. run `confirmation import`
5. run `workflow resume`
6. assert final status is `succeeded`
7. assert these files exist:
   - `requirement/spec/requirement-spec.json`
   - `test-spec/test-spec.json`
   - `test-spec/review-report.json`
   - `exports/xmind/test-spec.xmind`
   - `reports/design-report.md`
   - `traces/{runId}.jsonl`

- [ ] **Step 3: Verify mocked runtime loop**

Run: `bun test tests/runtime-loop.test.ts`

Expected: PASS.

## Task 10: Full Verification

**Files:**

- Modify only files required by previous tasks.

- [ ] **Step 1: Run all tests**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 3: Inspect artifact contract drift**

Run:

```bash
rg -n "Capability|MindMapExport|Archive|integration|inputSchema: RequirementDraft|type: branch|type: knowledge" .
```

Expected: no active contract drift except explicit renamed-from notes in docs.

- [ ] **Step 4: Commit**

```bash
git add apps packages plugins schemas workflows tests docs/superpowers/plans/2026-05-01-kata-agent-v0.1b-runtime-loop.md
git commit -m "feat: add mocked test-case-gen runtime loop"
```

## Self-Review

Spec coverage:

- Implements v0.1b mocked runtime loop without real Lanhu, real XMind, or real provider adapters.
- Keeps Workflow Engine as the only flow controller.
- Uses only v0.1a core node types.
- Adds Ajv validation before relying on runtime artifacts.
- Makes human confirmation import/resume executable.
- Keeps knowledge write-through as suggestions, not canonical knowledge mutation.

Known boundaries:

- Real provider adapters, real Lanhu HTTP, and real XMind binary export remain v0.1c.
- Rule Store loading is still minimal; prompt injection can be added after the mocked loop is stable.
- Schema depth can continue to tighten, but this plan validates the contracts required by the executor path.
