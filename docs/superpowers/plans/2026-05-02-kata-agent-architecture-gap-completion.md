# kata-agent Architecture Gap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining implemented-code gaps against `docs/superpowers/specs/2026-05-01-kata-agent-architecture-design.md` without expanding into reserved roadmap items.

**Architecture:** Keep the Workflow Engine as the only flow controller. Move orchestration entrypoints behind `SkillRunner`, make runtime/plugin/gate enforcement explicit and schema-backed, and keep every persisted artifact and trace event flowing through the existing repository/trace abstractions.

**Tech Stack:** TypeScript, Bun, Ajv JSON Schema validation, existing `workflow-engine`, `skill-runner`, `plugin-runtime`, `artifact-repo`, and `core` packages.

---

## Scope

Included:

- Implement `SkillRunner.start()` as the schema-validating workflow entrypoint.
- Complete workflow resume semantics for retryable failures, fatal failures, and downstream invalidation after artifact hash drift.
- Emit trace events for provider calls, plugin actions, artifact writes, knowledge operations, and human imports.
- Tighten plugin manifest/action contracts, side-effect shape, input/output schema validation, and declared permission checks.
- Complete G1-G6 gate rules that were only partially represented.
- Add a minimal Rule Store for global/project/run rules and thread it through prompts/gates as enforceable hard constraints.
- Promote v0.3 daily QA skills from CLI-only interface stubs to workflow-backed skills.

Excluded:

- Mobile, desktop, and full API automation surfaces.
- Plugin marketplace.
- `xmind-editor`.
- Dedicated Codex/Claude/Hermes provider adapters beyond the existing OpenAI-compatible adapter.
- macOS desktop console.

## Task 1: SkillRunner Workflow Entry

**Files:**

- Modify: `packages/skill-runner/src/runner.ts`
- Modify: `packages/skill-runner/src/index.ts`
- Modify: `tests/skill-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that constructs `SkillRunner` with a workflow loader and starter, validates input against the skill input schema, generates a UUID run id when absent, and returns a `RunHandle`.

- [ ] **Step 2: Verify red**

Run: `bun test tests/skill-runner.test.ts`

Expected: failure from the current stub `SkillRunner.start()`.

- [ ] **Step 3: Implement minimal runner**

Add constructor-injected dependencies: `loadWorkflow`, `startWorkflow`, and optional `generateRunId`. Reject `interface-only` and `planned` skills unless they have a workflow definition available. Validate `skill.inputs.schema` with `assertValidSchema`.

- [ ] **Step 4: Verify green**

Run: `bun test tests/skill-runner.test.ts`

## Task 2: Workflow Resume Semantics

**Files:**

- Modify: `packages/workflow-engine/src/types.ts`
- Modify: `schemas/workflow-run-state.schema.json`
- Modify: `packages/workflow-engine/src/state.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/workflow-executor.test.ts`
- Modify: `tests/workflow-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Cover these behaviors:

- retryable failed nodes rerun on resume.
- fatal failed nodes stay failed until manually reset.
- artifact hash drift invalidates downstream succeeded nodes back to `pending`.

- [ ] **Step 2: Verify red**

Run: `bun test tests/workflow-executor.test.ts tests/workflow-engine.test.ts`

- [ ] **Step 3: Implement state helpers**

Add `resetNode`, `invalidateFromNode`, and dependency traversal helpers. Store node artifact refs so drift can map artifact path/type back to a writer node.

- [ ] **Step 4: Implement executor semantics**

At resume start, verify indexed artifacts. If a ref no longer matches, find the writer node from persisted node artifact refs, invalidate that node and all downstream nodes, and continue from there. Skip fatal failed nodes by returning the failed state; rerun retryable failed nodes.

- [ ] **Step 5: Verify green**

Run targeted tests, then continue.

## Task 3: Trace Provenance Events

**Files:**

- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `packages/workflow-engine/src/types.ts`
- Modify: `schemas/workflow-run-state.schema.json`
- Modify: `tests/workflow-executor.test.ts`
- Modify: `tests/cli.smoke.test.ts`

- [ ] **Step 1: Write failing tests**

Assert traces include `agent-call`, `provider-call`, `plugin-action`, `artifact-write`, `knowledge-consult`, and `knowledge-propose` events during normal workflow execution.

- [ ] **Step 2: Verify red**

Run: `bun test tests/workflow-executor.test.ts tests/cli.smoke.test.ts`

- [ ] **Step 3: Add trace wrappers**

Wrap agent calls, action calls, and artifact writes inside the executor. Preserve existing `enter/exit/gate-*` events.

- [ ] **Step 4: Verify green**

Run the targeted tests.

## Task 4: Plugin Runtime Enforcement

**Files:**

- Modify: `packages/plugin-runtime/src/types.ts`
- Modify: `packages/plugin-runtime/src/action-registry.ts`
- Modify: `packages/plugin-runtime/src/constraints.ts`
- Modify: `schemas/plugin-action-manifest.schema.json`
- Modify: `schemas/plugin-manifest.schema.json`
- Modify: `plugins/playwright/plugin.yaml`
- Modify: `tests/plugin-runtime.test.ts`
- Modify: `tests/manifest-references.test.ts`

- [ ] **Step 1: Write failing tests**

Cover manifest side-effect validation, action input schema validation, action output schema validation, and denial when a network action is registered without a manifest that declares network permission.

- [ ] **Step 2: Verify red**

Run: `bun test tests/plugin-runtime.test.ts tests/manifest-references.test.ts`

- [ ] **Step 3: Implement manifest-backed action registry**

Let `PluginActionRegistry` optionally register manifests and validate actions against their declared schemas and permissions. Keep current simple registration path compatible for tests that do not need manifests.

- [ ] **Step 4: Normalize sideEffects**

Make every plugin action use `{ network, writeArtifacts, external }` and make schemas reject the legacy array shape.

- [ ] **Step 5: Verify green**

Run the targeted tests.

## Task 5: Complete Quality Gates

**Files:**

- Modify: `packages/workflow-engine/src/gates.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/quality-gates.test.ts`

- [ ] **Step 1: Write failing tests**

Cover G1 raw file hash/entity checks, G3 P1 handling, G5 entry/action/expected/blocker checks, and G6 markdown/hash consistency violations.

- [ ] **Step 2: Verify red**

Run: `bun test tests/quality-gates.test.ts`

- [ ] **Step 3: Implement pure gate checks**

Keep gates pure and pass artifact-index details in from the executor where needed.

- [ ] **Step 4: Verify green**

Run targeted tests.

## Task 6: Rule Store

**Files:**

- Create: `packages/core/src/rule-store.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `packages/workflow-engine/src/gates.ts`
- Create: `schemas/rule-set.schema.json`
- Modify: `packages/domain/src/schemas.ts`
- Modify: `tests/config-loader.test.ts`
- Modify: `tests/quality-gates.test.ts`

- [ ] **Step 1: Write failing tests**

Assert rule precedence is `run input > project rules > global rules > skill defaults`, `RuleSet` is registered, and hard rules are visible to gates.

- [ ] **Step 2: Verify red**

Run: `bun test tests/config-loader.test.ts tests/quality-gates.test.ts`

- [ ] **Step 3: Implement minimal rule store**

Load `rules/global.json`, `projects/{project}/rules.json`, and runtime input rules. Merge by rule id with precedence. Provide default hard rules from the architecture spec.

- [ ] **Step 4: Thread rules through runtime**

Make workflow execution context carry merged hard rules and let gates report violations for empty hard-rule lists or explicitly disabled non-negotiable rules.

- [ ] **Step 5: Verify green**

Run targeted tests.

## Task 7: Workflow-Backed v0.3 Skills

**Files:**

- Create: `workflows/static-scan.yaml`
- Create: `workflows/report-gen.yaml`
- Create: `workflows/hotfix-case-gen.yaml`
- Modify: `skills/static-scan/skill.yaml`
- Modify: `skills/report-gen/skill.yaml`
- Modify: `skills/hotfix-case-gen/skill.yaml`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/manifest-references.test.ts`
- Modify: `tests/static-scan-cli.test.ts`
- Modify: `tests/report-gen-cli.test.ts`
- Modify: `tests/hotfix-case-gen-cli.test.ts`

- [ ] **Step 1: Write failing tests**

Assert each v0.3 skill is no longer `interface-only`, has a workflow YAML, and its workflow node references resolve.

- [ ] **Step 2: Verify red**

Run: `bun test tests/manifest-references.test.ts`

- [ ] **Step 3: Add workflows and executor nodes**

Use artifact/tool nodes matching existing deterministic CLI behavior.

- [ ] **Step 4: Verify green**

Run targeted CLI and manifest tests.

## Task 8: Full Verification

**Files:**

- Modify: `README.md` if command semantics changed.

- [ ] Run `bun test`.
- [ ] Run `bun run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Re-scan `2026-05-01-kata-agent-architecture-design.md` and report remaining reserved roadmap items separately.
