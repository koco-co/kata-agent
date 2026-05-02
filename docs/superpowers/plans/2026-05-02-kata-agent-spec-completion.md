# kata-agent Spec Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining non-reserved v0.1 architecture spec gaps that are already expected by `docs/superpowers/specs/2026-05-01-kata-agent-architecture-design.md`.

**Architecture:** Keep the Workflow Engine as the only flow controller. Add missing quality gate checks as pure functions, invoke them from existing semantic workflow nodes, and keep all artifacts written through the Artifact Repository with schema/hash validation.

**Tech Stack:** TypeScript, Bun test, Ajv JSON schema validation, existing workflow-engine and artifact-repo packages.

---

## Scope

Included in this first completion batch:

- G1 Source Integrity gate for `RequirementSourceBundle`.
- G6 Artifact Consistency gate after XMind export.
- Canonical Markdown renders for `RequirementSpec` and `TestSpec`.
- P0 rejected confirmation handling with `reports/clarification-rebuttal.md`.
- Resume guard that fails a run when an indexed artifact hash no longer matches the file on disk.

Excluded from this batch because the spec marks them as reserved/future extension points:

- mobile, desktop, and API automation surfaces.
- full static-scan and source-repo-aware skills.
- macOS desktop console.
- DingTalk reply collection.

## Tasks

### Task 1: Source And Artifact Consistency Gates

**Files:**

- Modify: `packages/workflow-engine/src/gates.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `workflows/test-case-gen.yaml`
- Modify: `tests/quality-gates.test.ts`
- Modify: `tests/workflow-executor.test.ts`

- [x] Write failing tests for source integrity and XMind case-count mismatch.
- [x] Implement `checkSourceIntegrity` and `checkArtifactConsistency`.
- [x] Invoke G1 immediately after `ingest-requirement-source`.
- [x] Add a post-export `gate-artifact-consistency` node before `propose-knowledge`.
- [x] Verify targeted tests pass.

### Task 2: Canonical Markdown Renders

**Files:**

- Modify: `packages/workflow-engine/src/artifact-builders.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/artifact-builders.test.ts`
- Modify: `tests/runtime-loop.test.ts`

- [x] Write failing tests for `requirement-spec.md` and `test-spec.md`.
- [x] Add deterministic render helpers from JSON source-of-truth artifacts.
- [x] Write Markdown siblings immediately after JSON artifacts.
- [x] Verify targeted tests pass.

### Task 3: Rejected P0 Confirmation Rebuttal

**Files:**

- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/workflow-executor.test.ts`
- Modify: `tests/cli.runtime.test.ts`

- [x] Write failing test for a rejected P0 confirmation answer.
- [x] Block `await-confirmation-result` after import when a P0 gap is rejected.
- [x] Write `reports/clarification-rebuttal.md` through the Artifact Repository.
- [x] Verify targeted tests pass.

### Task 4: Resume Artifact Hash Guard

**Files:**

- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `tests/workflow-executor.test.ts`

- [x] Write failing test that tampers with an indexed upstream artifact before resume.
- [x] Verify indexed artifact hashes at resume start.
- [x] Mark the run failed with an artifact hash mismatch instead of silently continuing.
- [x] Verify targeted tests pass.

### Task 5: Full Verification

**Files:**

- Modify: `README.md` only if command/output documentation changes.

- [x] Run `bun test`.
- [x] Run `bun run typecheck`.
- [x] Re-scan spec gaps and report remaining reserved/future items separately.
