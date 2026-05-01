# kata-agent v0.1a Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1a contract foundation. Subsequent slices have their own plans:

- v0.1b runtime loop — `docs/superpowers/plans/2026-05-01-kata-agent-v0.1b-runtime-loop.md`
- v0.1c real Lanhu / XMind / provider demo — `docs/superpowers/plans/2026-05-01-kata-agent-v0.1c-real-providers.md`

**Architecture:** Workflow Engine is the hub. It calls Agent Runner, Plugin Runtime, Artifact Repository, Knowledge Repository, Gate functions, and Human nodes. Agents do local intelligence through Provider Registry. Plugins expose side-effect-declared Plugin Actions. Artifact Repository owns all writes.

**Tech Stack:** TypeScript, Bun (≥1.2) test runner, JSON Schema, YAML manifests, file-backed workflow state.

---

## v0.1a Decisions

| Decision                       | v0.1a Choice                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Requirement-only mode          | Not implemented                                                                        |
| Confirmation import format     | JSON canonical; Markdown import deferred                                               |
| XMind export                   | Included in `test-case-gen` workflow (v0.1c real)                                      |
| Product decisions to Knowledge | Emit `KnowledgeSuggestion`; require explicit acceptance via `knowledge-keeper`         |
| Runtime persistence            | File-backed JSON under `.state/`                                                       |
| Package manager                | Bun ≥1.2 only — `bun.lock` text lockfile; pinned by `engines.bun`                      |
| v0.1a manifests                | Only `test-case-gen`, `knowledge-keeper`, `lanhu`, `xmind`                             |
| v0.1a demo expectation         | Tested foundation, not e2e demo. v0.1b runs the first end-to-end mocked loop           |
| Old kata rules / source repos  | Rule Store + Source Repo are first-class reserved concepts; loaders deferred to v0.1b+ |
| Run ids                        | Caller-provided in v0.1a tests; `crypto.randomUUID()` from v0.1b                       |
| Schema source of truth         | `SCHEMA_REGISTRY` exported from `@kata-agent/domain`; tests/CLI never hand-type lists  |
| Naming                         | See "Final Naming" below; this plan uses elegant names throughout                      |

## Final Naming (locked)

| Concern               | Name                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents                | `source-normalizer`, `requirement-analyst`, `clarification-drafter`, `requirement-author`, `test-point-designer`, `test-spec-author`, `test-spec-reviewer` |
| Renamed schemas       | `EnhancedRequirement` → `RequirementSpec`; `ClarificationPack` → `ClarificationDossier`; `ProductConfirmation` → `ConfirmationDraft` (render reference)    |
| Plugin types          | `requirement-source`, `artifact-export`, `automation`, `notification`, `issue-tracker`, `rule-source`                                                      |
| CLI commands          | `kata-agent workflow status`, `kata-agent workflow resume`, `kata-agent confirmation import`                                                               |
| `feature.yaml.status` | `pending \| in-progress \| blocked \| completed \| archived`                                                                                               |
| `OpenItem.status`     | `unconfirmed \| confirmed \| assumed \| deferred` (closed enum)                                                                                            |
| Error code            | `KataAgentErrorCode` enum exported from `@kata-agent/core`                                                                                                 |

## File Structure

```text
apps/cli/src/
packages/core/src/
packages/domain/src/
packages/artifact-repo/src/
packages/plugin-runtime/src/
packages/workflow-engine/src/
packages/agent-runner/src/
packages/skill-runner/src/
packages/knowledge-repo/src/
plugins/lanhu/src/
plugins/xmind/src/
skills/test-case-gen/
skills/knowledge-keeper/
workflows/
agents/source-normalizer/
agents/requirement-analyst/
agents/clarification-drafter/
agents/requirement-author/
agents/test-point-designer/
agents/test-spec-author/
agents/test-spec-reviewer/
schemas/
tests/
projects/
```

## Task 1: Monorepo Foundation

**Files:**

- Create: `package.json`
- Create: `apps/cli/package.json`
- Create: `packages/*/package.json`
- Create: `plugins/lanhu/package.json`
- Create: `plugins/xmind/package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/version.ts`
- Create: `packages/core/src/error-code.ts`
- Create: `packages/core/src/config.ts`
- Test: `tests/core.smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kata-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "bun": ">=1.2.0"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "bun run typecheck"
  },
  "workspaces": ["apps/*", "packages/*", "plugins/*"],
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.0"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "yaml": "^2.7.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Before `bun install`, create a minimal `package.json` for every workspace member:

```json
{
  "name": "@kata-agent/core",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Use matching package names for:

- `apps/cli` → `@kata-agent/cli`
- `packages/core` → `@kata-agent/core`
- `packages/domain` → `@kata-agent/domain`
- `packages/artifact-repo` → `@kata-agent/artifact-repo`
- `packages/plugin-runtime` → `@kata-agent/plugin-runtime`
- `packages/workflow-engine` → `@kata-agent/workflow-engine`
- `packages/agent-runner` → `@kata-agent/agent-runner`
- `packages/skill-runner` → `@kata-agent/skill-runner`
- `packages/knowledge-repo` → `@kata-agent/knowledge-repo`
- `plugins/lanhu` → `@kata-agent/plugin-lanhu`
- `plugins/xmind` → `@kata-agent/plugin-xmind`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@kata-agent/core": ["packages/core/src/index.ts"],
      "@kata-agent/domain": ["packages/domain/src/index.ts"],
      "@kata-agent/artifact-repo": ["packages/artifact-repo/src/index.ts"],
      "@kata-agent/plugin-runtime": ["packages/plugin-runtime/src/index.ts"],
      "@kata-agent/workflow-engine": ["packages/workflow-engine/src/index.ts"],
      "@kata-agent/agent-runner": ["packages/agent-runner/src/index.ts"],
      "@kata-agent/skill-runner": ["packages/skill-runner/src/index.ts"],
      "@kata-agent/knowledge-repo": ["packages/knowledge-repo/src/index.ts"]
    }
  },
  "include": ["apps", "packages", "plugins", "tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
bun.lockb
projects/*/features/*/.state/
projects/*/features/*/traces/
projects/*/features/*/.history/
```

`bun.lockb` is excluded explicitly: this project uses the text-based `bun.lock` format. Both files must never coexist.

- [ ] **Step 4: Create core package**

`packages/core/src/version.ts`:

```ts
export const SCHEMA_VERSION = "0.1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;
```

`packages/core/src/error-code.ts`:

```ts
export const KATA_AGENT_ERROR_CODES = [
  "INVALID_MODEL_JSON",
  "SCHEMA_VALIDATION_FAILED",
  "PROVIDER_TRANSIENT",
  "PLUGIN_NETWORK_TRANSIENT",
  "MISSING_SECRET",
  "FORBIDDEN_WRITE_SCOPE",
  "UNRESOLVED_P0_GAP",
  "INVALID_WORKFLOW_DEFINITION",
  "SCHEMA_REFERENCE_NOT_FOUND",
  "ARTIFACT_HASH_MISMATCH",
  "RUN_CANCELLED",
] as const;

export type KataAgentErrorCode = (typeof KATA_AGENT_ERROR_CODES)[number];

const RETRYABLE_CODES = new Set<KataAgentErrorCode>([
  "INVALID_MODEL_JSON",
  "SCHEMA_VALIDATION_FAILED",
  "PROVIDER_TRANSIENT",
  "PLUGIN_NETWORK_TRANSIENT",
]);

export function isRetryable(code: KataAgentErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}
```

`packages/core/src/config.ts` (interface only — implementation lands in v0.1b):

```ts
export interface ConfigLoader {
  loadEnv(): Record<string, string>;
  resolveSecret(name: string): string | undefined;
  loadProjectConfig(project: string): unknown;
}
```

`packages/core/src/index.ts`:

```ts
export { SCHEMA_VERSION } from "./version";
export type { SchemaVersion } from "./version";
export {
  KATA_AGENT_ERROR_CODES,
  isRetryable,
  type KataAgentErrorCode,
} from "./error-code";
export type { ConfigLoader } from "./config";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

import { isRetryable, type KataAgentErrorCode } from "./error-code";

export class KataAgentError extends Error {
  readonly retryable: boolean;
  constructor(
    message: string,
    readonly code: KataAgentErrorCode,
  ) {
    super(message);
    this.name = "KataAgentError";
    this.retryable = isRetryable(code);
  }
}
```

- [ ] **Step 5: Create `tests/core.smoke.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { KataAgentError, SCHEMA_VERSION } from "../packages/core/src/index";

describe("core error", () => {
  test("derives retryability from code, not arguments", () => {
    expect(
      new KataAgentError("missing secret", "MISSING_SECRET").retryable,
    ).toBe(false);
    expect(new KataAgentError("bad json", "INVALID_MODEL_JSON").retryable).toBe(
      true,
    );
    expect(SCHEMA_VERSION).toBe("0.1");
  });
});
```

- [ ] **Step 6: Install dependencies**

Run: `bun install`

Expected: dependencies install and a lockfile is generated.

- [ ] **Step 7: Run tests**

Run: `bun test tests/core.smoke.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json apps/cli/package.json packages/*/package.json plugins/*/package.json bun.lock tsconfig.json .gitignore packages/core/src tests/core.smoke.test.ts
git commit -m "chore: initialize kata-agent monorepo"
```

## Task 2: Complete v0.1 Domain Contracts

**Files:**

- Create: `packages/domain/src/feature.ts`
- Create: `packages/domain/src/artifact.ts`
- Create: `packages/domain/src/gap.ts`
- Create: `packages/domain/src/requirement.ts`
- Create: `packages/domain/src/test-point.ts`
- Create: `packages/domain/src/test-spec.ts`
- Create: `packages/domain/src/review.ts`
- Create: `packages/domain/src/knowledge.ts`
- Create: `packages/domain/src/schemas.ts` # SCHEMA_REGISTRY single source of truth
- Create: `packages/domain/src/index.ts`
- Create: `schemas/*.schema.json`
- Test: `tests/domain.contracts.test.ts`

- [ ] **Step 1: Create feature, artifact, and gap types**

`packages/domain/src/feature.ts`:

```ts
export type FeatureStatus =
  | "pending"
  | "in-progress"
  | "blocked"
  | "completed"
  | "archived";

export interface FeatureManifest {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title?: string;
  sourceUrl?: string;
  owner?: string;
  createdAt: string;
  status: FeatureStatus;
}
```

`packages/domain/src/artifact.ts`:

```ts
export interface ArtifactRef {
  id: string;
  type: string;
  path: string;
  schemaVersion: string;
  createdBy: string;
  createdAt: string;
  hash: string;
}
```

`packages/domain/src/gap.ts`:

```ts
export const GAP_CATEGORIES = [
  "business-goal",
  "user-role",
  "entry-path",
  "page-structure",
  "ui-copy",
  "field-rule",
  "interaction-flow",
  "state-flow",
  "data-rule",
  "exception-rule",
  "permission-rule",
  "compatibility",
  "non-functional",
  "dependency",
  "conflict",
  "automation-blocker",
] as const;

export type GapCategory = (typeof GAP_CATEGORIES)[number];
export type GapSeverity = "P0" | "P1" | "P2" | "P3";

export interface RequirementGap {
  id: string;
  category: GapCategory;
  severity: GapSeverity;
  evidence: string;
  impact: string;
  question: string;
  suggestedDefault?: string;
  sourceRefs: string[];
}

export interface RequirementGapReport {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  gaps: RequirementGap[];
}
```

- [ ] **Step 2: Create requirement contracts**

`packages/domain/src/requirement.ts`:

```ts
export interface RawSourceFile {
  id: string;
  path: string;
  mediaType: string;
  hash: string;
}

export interface RequirementSourceBundle {
  schemaVersion: "0.1";
  sourceType: "lanhu" | "markdown" | "text";
  sourceUrl?: string;
  title?: string;
  textBlocks: Array<{ id: string; title?: string; content: string }>;
  images: Array<{
    id: string;
    path: string;
    caption?: string;
    sourceUrl?: string;
  }>;
  rawFiles: RawSourceFile[];
  fetchedAt: string;
}

export interface LanhuFetchInput {
  url: string;
  cookieEnv?: "LANHU_COOKIE";
  outputDir: string;
}

export interface TestCaseGenInput {
  project: string;
  feature: string;
  source: { type: "lanhu"; url: string };
}

export interface RequirementDraft {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  facts: Array<{ id: string; content: string; sourceRefs: string[] }>;
}

export interface KnowledgeConsultResult {
  schemaVersion: "0.1";
  query: string;
  snippets: Array<{
    id: string;
    source: string;
    content: string;
    relevance: "high" | "medium" | "low";
  }>;
}

export interface RequirementAnalysisInput {
  schemaVersion: "0.1";
  requirementDraftRef: string;
  knowledgeConsultRef: string;
}

export interface ClarificationDossier {
  schemaVersion: "0.1";
  summary: string;
  questions: Array<{
    id: string;
    severity: "P0" | "P1" | "P2" | "P3";
    category: string;
    question: string;
    impact: string;
    suggestedDefault?: string;
    requiresProductAnswer: boolean;
  }>;
  assumptions: Array<{
    id: string;
    content: string;
    risk: "low" | "medium" | "high";
  }>;
}

/** A render reference: confirmation-draft.md is the rendered view of the dossier; no new facts. */
export interface ConfirmationDraft {
  schemaVersion: "0.1";
  clarificationDossierRef: string;
  renderedMarkdownPath: string;
  renderedAt: string;
}

export interface ConfirmationResult {
  schemaVersion: "0.1";
  answers: Array<{
    questionId: string;
    status: "confirmed" | "rejected" | "assumed" | "unanswered";
    answer?: string;
  }>;
}

export interface RequirementAuthorInput {
  schemaVersion: "0.1";
  requirementDraftRef: string;
  gapReportRef: string;
  clarificationDossierRef: string;
  confirmationResultRef: string;
}

export type OpenItemStatus =
  | "unconfirmed"
  | "confirmed"
  | "assumed"
  | "deferred";

export interface RequirementSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  status: "draft" | "confirmed" | "assumed" | "blocked";
  rules: Array<{
    id: string;
    text: string;
    severity: "P0" | "P1" | "P2" | "P3";
    sourceType: "source" | "confirmation" | "assumption" | "unknown";
    sourceRefs: string[];
    confirmationQuestionId?: string;
    assumptionRef?: string;
  }>;
  pageContracts: Array<{
    id: string;
    name: string;
    surface: "web" | "mobile" | "desktop" | "api";
  }>;
  openItems: Array<{
    id: string;
    severity: "P0" | "P1" | "P2" | "P3";
    status: OpenItemStatus;
    question: string;
  }>;
  assumptions: Array<{
    id: string;
    content: string;
    risk: "low" | "medium" | "high";
  }>;
}
```

- [ ] **Step 3: Create test point and TestSpec contracts**

`packages/domain/src/test-point.ts`:

```ts
export interface TestPoint {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  requirementRefs: string[];
  risk: "low" | "medium" | "high";
}

export interface TestPointSet {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  points: TestPoint[];
}
```

`packages/domain/src/test-spec.ts`:

```ts
export type TestAssertionLayer = "L1" | "L2" | "L3" | "L4" | "L5";

export interface TestSpec {
  schemaVersion: "0.1";
  project: string;
  feature: string;
  title: string;
  requirementRef: string;
  status: "draft" | "reviewed" | "blocked";
  modules: Array<{
    id: string;
    name: string;
    requirementRefs: string[];
    cases: Array<{
      id: string;
      title: string;
      priority: "P0" | "P1" | "P2";
      requirementRefs: string[];
      steps: Array<{
        id: string;
        action: string;
        expected: string;
        requirementRefs: string[];
      }>;
      assertions: Array<{
        id: string;
        layer: TestAssertionLayer;
        kind: string;
        target: string;
        expected: string;
        requirementRefs: string[];
      }>;
      automation: {
        surface: "web" | "mobile" | "desktop" | "api";
        readiness: "ready" | "partial" | "blocked" | "manual-only";
        uiContractRefs: string[];
        blockers: Array<{
          type: string;
          message: string;
          relatedOpenItem?: string;
        }>;
      };
      traceability: { requirementRefs: string[]; sourceRefs: string[] };
    }>;
  }>;
}

export interface TestSpecAuthorInput {
  schemaVersion: "0.1";
  testPointSetRef: string;
  requirementSpecRef: string;
}

export interface TestSpecReviewerInput {
  schemaVersion: "0.1";
  testSpecRef: string;
  requirementSpecRef: string;
}
```

- [ ] **Step 4: Create review and knowledge contracts**

`packages/domain/src/review.ts`:

```ts
export interface ReviewReport {
  schemaVersion: "0.1";
  passed: boolean;
  violations: Array<{
    id: string;
    severity: "error" | "warning";
    message: string;
    artifactRef?: string;
  }>;
}

export interface XMindExport {
  schemaVersion: "0.1";
  outputPath: string;
  caseCount: number;
}

export interface DesignReport {
  schemaVersion: "0.1";
  summary: string;
  artifactRefs: string[];
  gateResults: Array<{
    gateId: string;
    passed: boolean;
    violations: Array<{
      id: string;
      severity: "error" | "warning";
      message: string;
    }>;
  }>;
}
```

`packages/domain/src/knowledge.ts`:

```ts
export interface KnowledgeSuggestion {
  schemaVersion: "0.1";
  category:
    | "business-rule"
    | "product-decision"
    | "surface-knowledge"
    | "pitfall";
  confidence: "high" | "medium" | "low";
  sourceArtifact: string;
  content: string;
  targetCategory?: "terms" | "business-rules" | "modules" | "surfaces" | "pitfalls" | "decisions";
  targetSlug?: string;
  reason: string;
}
```

- [ ] **Step 5: Create domain index and SCHEMA_REGISTRY**

`packages/domain/src/schemas.ts` is the single source of truth for every schema name → schema-file path mapping. Tests, manifests, and CLIs must read this registry; nothing may hand-type a schema list.

```ts
export const SCHEMA_REGISTRY = {
  ArtifactRef: "schemas/artifact-ref.schema.json",
  FeatureManifest: "schemas/feature-manifest.schema.json",
  TestCaseGenInput: "schemas/test-case-gen-input.schema.json",
  LanhuFetchInput: "schemas/lanhu-fetch-input.schema.json",
  RawSourceFile: "schemas/raw-source-file.schema.json",
  RequirementSourceBundle: "schemas/requirement-source-bundle.schema.json",
  RequirementDraft: "schemas/requirement-draft.schema.json",
  KnowledgeConsultResult: "schemas/knowledge-consult-result.schema.json",
  RequirementAnalysisInput: "schemas/requirement-analysis-input.schema.json",
  RequirementGap: "schemas/requirement-gap.schema.json",
  RequirementGapReport: "schemas/requirement-gap-report.schema.json",
  ClarificationDossier: "schemas/clarification-dossier.schema.json",
  ConfirmationDraft: "schemas/confirmation-draft.schema.json",
  ConfirmationResult: "schemas/confirmation-result.schema.json",
  RequirementAuthorInput: "schemas/requirement-author-input.schema.json",
  RequirementSpec: "schemas/requirement-spec.schema.json",
  TestPoint: "schemas/test-point.schema.json",
  TestPointSet: "schemas/test-point-set.schema.json",
  TestSpecAuthorInput: "schemas/test-spec-author-input.schema.json",
  TestSpecReviewerInput: "schemas/test-spec-reviewer-input.schema.json",
  TestSpec: "schemas/test-spec.schema.json",
  ReviewReport: "schemas/review-report.schema.json",
  XMindExport: "schemas/xmind-export.schema.json",
  DesignReport: "schemas/design-report.schema.json",
  KnowledgeSuggestion: "schemas/knowledge-suggestion.schema.json",
  PluginManifest: "schemas/plugin-manifest.schema.json",
  PluginActionManifest: "schemas/plugin-action-manifest.schema.json",
  SkillManifest: "schemas/skill-manifest.schema.json",
  AgentManifest: "schemas/agent-manifest.schema.json",
  ProviderRequest: "schemas/provider-request.schema.json",
  ProviderResponse: "schemas/provider-response.schema.json",
  WorkflowDefinition: "schemas/workflow-definition.schema.json",
  WorkflowRunState: "schemas/workflow-run-state.schema.json",
  TraceEvent: "schemas/trace-event.schema.json",
} as const;

export type SchemaName = keyof typeof SCHEMA_REGISTRY;
export const SCHEMA_NAMES = Object.keys(SCHEMA_REGISTRY) as SchemaName[];
```

`packages/domain/src/index.ts`:

```ts
export type { FeatureManifest, FeatureStatus } from "./feature";
export type { ArtifactRef } from "./artifact";
export { GAP_CATEGORIES } from "./gap";
export type {
  GapCategory,
  GapSeverity,
  RequirementGap,
  RequirementGapReport,
} from "./gap";
export type {
  ClarificationDossier,
  ConfirmationDraft,
  ConfirmationResult,
  KnowledgeConsultResult,
  RequirementAnalysisInput,
  RequirementAuthorInput,
  RequirementSpec,
  RequirementDraft,
  RequirementSourceBundle,
  RawSourceFile,
  LanhuFetchInput,
  TestCaseGenInput,
  OpenItemStatus,
} from "./requirement";
export type { TestPoint, TestPointSet } from "./test-point";
export type { TestAssertionLayer, TestSpec, TestSpecAuthorInput, TestSpecReviewerInput } from "./test-spec";
export type { DesignReport, ReviewReport, XMindExport } from "./review";
export type { KnowledgeSuggestion } from "./knowledge";
export { SCHEMA_REGISTRY, SCHEMA_NAMES, type SchemaName } from "./schemas";
```

- [ ] **Step 6: Create schema files for every v0.1 contract**

Create one schema file per contract under `schemas/`. Most files can start from the JSON Schema skeleton shown below, with `title`, `$id`, and `required` values from the table that follows. Files named in the closed enum list must also include the exact nested `enum` constraints shown there; the domain contract test verifies those paths.

Example `schemas/test-point-set.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/test-point-set.schema.json",
  "title": "TestPointSet",
  "type": "object",
  "required": ["schemaVersion", "project", "feature", "points"],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "project": { "type": "string" },
    "feature": { "type": "string" },
    "points": { "type": "array" }
  },
  "additionalProperties": true
}
```

Create these files with these required top-level fields. The schema file basename always equals the kebab-case form of `SCHEMA_REGISTRY` keys.

| File                                    | title                     | required                                                                                              |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `feature-manifest.schema.json`          | `FeatureManifest`         | `schemaVersion`, `project`, `feature`, `createdAt`, `status`                                          |
| `artifact-ref.schema.json`              | `ArtifactRef`             | `id`, `type`, `path`, `schemaVersion`, `createdBy`, `createdAt`, `hash`                               |
| `lanhu-fetch-input.schema.json`         | `LanhuFetchInput`         | `url`, `outputDir`                                                                                    |
| `test-case-gen-input.schema.json`       | `TestCaseGenInput`        | `project`, `feature`, `source`                                                                        |
| `raw-source-file.schema.json`           | `RawSourceFile`           | `id`, `path`, `mediaType`, `hash`                                                                     |
| `requirement-source-bundle.schema.json` | `RequirementSourceBundle` | `schemaVersion`, `sourceType`, `textBlocks`, `images`, `rawFiles`, `fetchedAt`                        |
| `requirement-draft.schema.json`         | `RequirementDraft`        | `schemaVersion`, `project`, `feature`, `title`, `facts`                                               |
| `knowledge-consult-result.schema.json`  | `KnowledgeConsultResult`  | `schemaVersion`, `query`, `snippets`                                                                  |
| `requirement-analysis-input.schema.json` | `RequirementAnalysisInput` | `schemaVersion`, `requirementDraftRef`, `knowledgeConsultRef`                                         |
| `requirement-gap.schema.json`           | `RequirementGap`          | `id`, `category`, `severity`, `evidence`, `impact`, `question`, `sourceRefs`                          |
| `requirement-gap-report.schema.json`    | `RequirementGapReport`    | `schemaVersion`, `project`, `feature`, `gaps`                                                         |
| `clarification-dossier.schema.json`     | `ClarificationDossier`    | `schemaVersion`, `summary`, `questions`, `assumptions`                                                |
| `confirmation-draft.schema.json`        | `ConfirmationDraft`       | `schemaVersion`, `clarificationDossierRef`, `renderedMarkdownPath`, `renderedAt`                      |
| `confirmation-result.schema.json`       | `ConfirmationResult`      | `schemaVersion`, `answers`                                                                            |
| `requirement-author-input.schema.json`  | `RequirementAuthorInput`  | `schemaVersion`, `requirementDraftRef`, `gapReportRef`, `clarificationDossierRef`, `confirmationResultRef` |
| `requirement-spec.schema.json`          | `RequirementSpec`         | `schemaVersion`, `project`, `feature`, `title`, `status`, `rules`, `pageContracts`, `openItems`, `assumptions` |
| `test-point.schema.json`                | `TestPoint`               | `id`, `title`, `priority`, `requirementRefs`, `risk`                                                  |
| `test-point-set.schema.json`            | `TestPointSet`            | `schemaVersion`, `project`, `feature`, `points`                                                       |
| `test-spec-author-input.schema.json`    | `TestSpecAuthorInput`     | `schemaVersion`, `testPointSetRef`, `requirementSpecRef`                                              |
| `test-spec-reviewer-input.schema.json`  | `TestSpecReviewerInput`   | `schemaVersion`, `testSpecRef`, `requirementSpecRef`                                                  |
| `test-spec.schema.json`                 | `TestSpec`                | `schemaVersion`, `project`, `feature`, `title`, `requirementRef`, `status`, `modules`                 |
| `review-report.schema.json`             | `ReviewReport`            | `schemaVersion`, `passed`, `violations`                                                               |
| `xmind-export.schema.json`              | `XMindExport`             | `schemaVersion`, `outputPath`, `caseCount`                                                            |
| `design-report.schema.json`             | `DesignReport`            | `schemaVersion`, `summary`, `artifactRefs`, `gateResults`                                             |
| `knowledge-suggestion.schema.json`      | `KnowledgeSuggestion`     | `schemaVersion`, `category`, `confidence`, `sourceArtifact`, `content`, `reason`                      |
| `plugin-manifest.schema.json`           | `PluginManifest`          | `name`, `title`, `version`, `type`, `actions`, `permissions`                                          |
| `plugin-action-manifest.schema.json`    | `PluginActionManifest`    | `id`, `title`, `inputSchema`, `outputSchema`                                                          |
| `skill-manifest.schema.json`            | `SkillManifest`           | `name`, `title`, `version`, `description`, `workflow`                                                 |
| `agent-manifest.schema.json`            | `AgentManifest`           | `name`, `title`, `version`, `inputSchema`, `outputSchema`, `ownerSkill`, `promptPath`                 |
| `provider-request.schema.json`          | `ProviderRequest`         | `messages`, `metadata`                                                                                |
| `provider-response.schema.json`         | `ProviderResponse`        | `content`, `usage`                                                                                    |
| `workflow-definition.schema.json`       | `WorkflowDefinition`      | `id`, `version`, `skill`, `nodes`                                                                     |
| `workflow-run-state.schema.json`        | `WorkflowRunState`        | `workflowId`, `runId`, `status`, `nodes`                                                              |
| `trace-event.schema.json`               | `TraceEvent`              | `runId`, `nodeId`, `type`, `at`                                                                       |

Closed enum requirements:

- `FeatureManifest.status`: `["pending", "in-progress", "blocked", "completed", "archived"]`
- `RequirementSpec.status`: `["draft", "confirmed", "assumed", "blocked"]`
- `RequirementSpec.openItems[].status`: `["unconfirmed", "confirmed", "assumed", "deferred"]`
- `WorkflowRunState.status`: `["created", "running", "waiting", "succeeded", "failed", "blocked", "cancelled"]`
- `WorkflowRunState.nodes.*.status`: `["pending", "ready", "running", "waiting", "succeeded", "failed", "skipped", "blocked", "cancelled"]`
- `TraceEvent.type`: `["enter", "exit", "gate-passed", "gate-failed", "node-skipped", "agent-call", "provider-call", "provider-cost-summary", "plugin-action", "artifact-write", "knowledge-consult", "knowledge-propose", "human-import"]`
- `PluginManifest.type`: `["requirement-source", "artifact-export", "automation", "notification", "issue-tracker", "rule-source"]`

These enum constraints must be present in the JSON Schema files in v0.1a. v0.1b adds Ajv execution; it should not need to repair missing enum contracts.

- [ ] **Step 7: Create domain contract test**

`tests/domain.contracts.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  GAP_CATEGORIES,
  SCHEMA_REGISTRY,
  SCHEMA_NAMES,
  type ConfirmationResult,
  type TestPointSet,
} from "../packages/domain/src/index";

function readSchema(path: string): Record<string, any> {
  return JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
}

function expectEnum(
  schemaName: keyof typeof SCHEMA_REGISTRY,
  path: string[],
  values: string[],
): void {
  let current: any = readSchema(SCHEMA_REGISTRY[schemaName]);
  for (const segment of path) current = current?.[segment];
  expect(current?.enum, `${String(schemaName)} ${path.join(".")}`).toEqual(values);
}

describe("domain contracts", () => {
  test("every SCHEMA_REGISTRY entry resolves to a real file", () => {
    for (const name of SCHEMA_NAMES) {
      const file = SCHEMA_REGISTRY[name];
      expect(
        existsSync(join(import.meta.dir, "..", file)),
        `${name} → ${file}`,
      ).toBe(true);
    }
  });

  test("gap taxonomy is closed", () => {
    expect(GAP_CATEGORIES).toContain("automation-blocker");
    expect(GAP_CATEGORIES).toHaveLength(16);
  });

  test("required closed enum constraints are present in JSON Schemas", () => {
    expectEnum("FeatureManifest", ["properties", "status"], [
      "pending",
      "in-progress",
      "blocked",
      "completed",
      "archived",
    ]);
    expectEnum("RequirementSpec", ["properties", "status"], [
      "draft",
      "confirmed",
      "assumed",
      "blocked",
    ]);
    expectEnum(
      "RequirementSpec",
      ["properties", "openItems", "items", "properties", "status"],
      ["unconfirmed", "confirmed", "assumed", "deferred"],
    );
    expectEnum("WorkflowRunState", ["properties", "status"], [
      "created",
      "running",
      "waiting",
      "succeeded",
      "failed",
      "blocked",
      "cancelled",
    ]);
    expectEnum(
      "WorkflowRunState",
      ["properties", "nodes", "additionalProperties", "properties", "status"],
      [
        "pending",
        "ready",
        "running",
        "waiting",
        "succeeded",
        "failed",
        "skipped",
        "blocked",
        "cancelled",
      ],
    );
    expectEnum("TraceEvent", ["properties", "type"], [
      "enter",
      "exit",
      "gate-passed",
      "gate-failed",
      "node-skipped",
      "agent-call",
      "provider-call",
      "provider-cost-summary",
      "plugin-action",
      "artifact-write",
      "knowledge-consult",
      "knowledge-propose",
      "human-import",
    ]);
    expectEnum("PluginManifest", ["properties", "type"], [
      "requirement-source",
      "artifact-export",
      "automation",
      "notification",
      "issue-tracker",
      "rule-source",
    ]);
  });

  test("confirmation and test point types compile", () => {
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [],
    };
    const points: TestPointSet = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "demo",
      points: [],
    };
    expect(confirmation.answers).toEqual([]);
    expect(points.points).toEqual([]);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `bun test tests/domain.contracts.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/domain schemas tests/domain.contracts.test.ts
git commit -m "feat: define complete v0.1 domain contracts"
```

## Task 3: Plugin Runtime With Permissions

**Files:**

- Create: `packages/plugin-runtime/src/types.ts`
- Create: `packages/plugin-runtime/src/registry.ts`
- Create: `packages/plugin-runtime/src/constraints.ts`
- Create: `packages/plugin-runtime/src/index.ts`
- Modify: `schemas/plugin-manifest.schema.json`
- Create: `plugins/lanhu/plugin.yaml`
- Create: `plugins/xmind/plugin.yaml`
- Test: `tests/plugin-runtime.test.ts`

- [ ] **Step 1: Create plugin types**

`packages/plugin-runtime/src/types.ts`:

```ts
export type PluginType =
  | "requirement-source"
  | "artifact-export"
  | "automation"
  | "notification"
  | "issue-tracker"
  | "rule-source";
export type NetworkPermission = "none" | "restricted" | "open";

export interface PluginActionManifest {
  id: string;
  title: string;
  inputSchema: string;
  outputSchema: string;
  sideEffects?: { network?: boolean; writeArtifacts?: boolean; external?: boolean };
}

export interface PluginPermissions {
  network: NetworkPermission;
  secrets: string[];
  writeScopes: string[];
}

export interface PluginManifest {
  name: string;
  title: string;
  version: string;
  type: PluginType;
  actions: PluginActionManifest[];
  permissions: PluginPermissions;
}
```

- [ ] **Step 2: Create plugin constraints**

`packages/plugin-runtime/src/constraints.ts`:

```ts
import type { PluginManifest } from "./types";

const PLUGIN_OUTPUT_CONTRACTS: Record<string, readonly string[]> = {
  "requirement-source": ["RequirementSourceBundle"],
  "artifact-export": ["XMindExport"],
  automation: ["RunRecord", "EvidencePack"],
  notification: ["NotificationResult"],
  "issue-tracker": ["IssueSyncResult"],
  "rule-source": ["RuleSet"],
};

export function validatePluginManifest(manifest: PluginManifest): void {
  const allowedOutputs = PLUGIN_OUTPUT_CONTRACTS[manifest.type] ?? [];
  for (const action of manifest.actions) {
    if (!allowedOutputs.includes(action.outputSchema)) {
      throw new Error(
        `${manifest.type} action outputSchema is not allowed: ${action.id} -> ${action.outputSchema}`,
      );
    }
  }
}
```

- [ ] **Step 3: Create plugin registry**

`packages/plugin-runtime/src/registry.ts`:

```ts
import { validatePluginManifest } from "./constraints";
import type { PluginManifest } from "./types";

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();

  register(manifest: PluginManifest): void {
    validatePluginManifest(manifest);
    if (this.manifests.has(manifest.name))
      throw new Error(`Plugin already registered: ${manifest.name}`);
    this.manifests.set(manifest.name, manifest);
  }

  list(): PluginManifest[] {
    return [...this.manifests.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  findAction(actionId: string): PluginManifest | null {
    return (
      this.list().find((manifest) =>
        manifest.actions.some((action) => action.id === actionId),
      ) ?? null
    );
  }
}
```

- [ ] **Step 4: Create plugin runtime index**

`packages/plugin-runtime/src/index.ts`:

```ts
export type {
  NetworkPermission,
  PluginActionManifest,
  PluginManifest,
  PluginPermissions,
  PluginType,
} from "./types";
export { validatePluginManifest } from "./constraints";
export { PluginRegistry } from "./registry";
```

- [ ] **Step 5: Refine plugin schema and create only v0.1a plugin manifests**

`schemas/plugin-manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/plugin-manifest.schema.json",
  "title": "PluginManifest",
  "type": "object",
  "required": ["name", "title", "version", "type", "actions", "permissions"],
  "properties": {
    "name": { "type": "string" },
    "title": { "type": "string" },
    "version": { "type": "string" },
    "type": {
      "type": "string",
      "enum": [
        "requirement-source",
        "artifact-export",
        "automation",
        "notification",
        "issue-tracker",
        "rule-source"
      ]
    },
    "actions": { "type": "array" },
    "permissions": { "type": "object" }
  },
  "additionalProperties": false
}
```

`plugins/lanhu/plugin.yaml`:

```yaml
name: lanhu
title: 蓝湖需求源
version: 0.1.0
type: requirement-source
actions:
  - id: lanhu.fetchRequirement
    title: 拉取蓝湖需求
    inputSchema: LanhuFetchInput
    outputSchema: RequirementSourceBundle
    sideEffects:
      network: true
      writeArtifacts: true
permissions:
  network: restricted
  secrets:
    - LANHU_COOKIE
  writeScopes:
    - feature.sources
```

`plugins/xmind/plugin.yaml`:

```yaml
name: xmind
title: XMind 导出
version: 0.1.0
type: artifact-export
actions:
  - id: xmind.export
    title: 导出 XMind
    inputSchema: TestSpec
    outputSchema: XMindExport
    sideEffects:
      writeArtifacts: true
permissions:
  network: none
  secrets: []
  writeScopes:
    - feature.exports
```

- [ ] **Step 6: Create plugin runtime test**

`tests/plugin-runtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  PluginRegistry,
  validatePluginManifest,
  type PluginManifest,
} from "../packages/plugin-runtime/src/index";

describe("plugin runtime", () => {
  test("registers and resolves plugin actions", () => {
    const registry = new PluginRegistry();
    const manifest: PluginManifest = {
      name: "lanhu",
      title: "蓝湖需求源",
      version: "0.1.0",
      type: "requirement-source",
      actions: [
        {
          id: "lanhu.fetchRequirement",
          title: "拉取蓝湖需求",
          inputSchema: "LanhuFetchInput",
          outputSchema: "RequirementSourceBundle",
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["LANHU_COOKIE"],
        writeScopes: ["feature.sources"],
      },
    };
    registry.register(manifest);
    expect(registry.findAction("lanhu.fetchRequirement")?.name).toBe("lanhu");
  });

  test("rejects source plugins that output non-source schemas", () => {
    const manifest: PluginManifest = {
      name: "bad",
      title: "bad",
      version: "0.1.0",
      type: "requirement-source",
      actions: [
        {
          id: "bad.notify",
          title: "bad",
          inputSchema: "Anything",
          outputSchema: "NotificationResult",
        },
      ],
      permissions: { network: "open", secrets: [], writeScopes: [] },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "requirement-source action outputSchema is not allowed",
    );
  });

  test("rejects export plugins that output non-export schemas", () => {
    const manifest: PluginManifest = {
      name: "bad-export",
      title: "bad export",
      version: "0.1.0",
      type: "artifact-export",
      actions: [
        {
          id: "xmind.export",
          title: "bad",
          inputSchema: "TestSpec",
          outputSchema: "TestSpec",
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.exports"],
      },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "artifact-export action outputSchema is not allowed",
    );
  });
});
```

- [ ] **Step 7: Run tests**

Run: `bun test tests/plugin-runtime.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-runtime plugins tests/plugin-runtime.test.ts
git commit -m "feat: add permissioned plugin runtime"
```

## Task 4: Skill Runner Manifest Contract

**Files:**

- Create: `packages/skill-runner/src/types.ts`
- Create: `packages/skill-runner/src/registry.ts`
- Create: `packages/skill-runner/src/runner.ts`
- Create: `packages/skill-runner/src/index.ts`
- Modify: `schemas/skill-manifest.schema.json`
- Test: `tests/skill-runner.test.ts`

- [ ] **Step 1: Create skill runner types**

`packages/skill-runner/src/types.ts`:

```ts
export interface SkillManifest {
  name: string;
  title: string;
  version: string;
  description: string;
  workflow: string;
  inputs?: { schema: string };
  outputs?: string[];
  requiredPlugins?: string[];
  status?: "full" | "interface-only" | "planned";
}
```

- [ ] **Step 2: Create skill registry**

`packages/skill-runner/src/registry.ts`:

```ts
import type { SkillManifest } from "./types";

export class SkillRegistry {
  private readonly manifests = new Map<string, SkillManifest>();

  register(manifest: SkillManifest): void {
    if (this.manifests.has(manifest.name))
      throw new Error(`Skill already registered: ${manifest.name}`);
    this.manifests.set(manifest.name, manifest);
  }

  get(name: string): SkillManifest | null {
    return this.manifests.get(name) ?? null;
  }

  list(): SkillManifest[] {
    return [...this.manifests.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}
```

- [ ] **Step 3: Create SkillRunner shell**

`packages/skill-runner/src/runner.ts`:

```ts
import type { SkillManifest } from "./types";

export interface RunHandle {
  runId: string;
  workflowId: string;
  status: "created";
}

export class SkillRunner {
  async start(_skill: SkillManifest, _input: unknown): Promise<RunHandle> {
    throw new Error("SkillRunner.start is implemented in v0.1b");
  }
}
```

- [ ] **Step 4: Create skill runner index**

`packages/skill-runner/src/index.ts`:

```ts
export type { SkillManifest } from "./types";
export { SkillRegistry } from "./registry";
export type { RunHandle } from "./runner";
export { SkillRunner } from "./runner";
```

- [ ] **Step 5: Refine `schemas/skill-manifest.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/skill-manifest.schema.json",
  "title": "SkillManifest",
  "type": "object",
  "required": ["name", "title", "version", "description", "workflow"],
  "properties": {
    "name": { "type": "string" },
    "title": { "type": "string" },
    "version": { "type": "string" },
    "description": { "type": "string" },
    "workflow": { "type": "string" },
    "inputs": { "type": "object" },
    "outputs": { "type": "array" },
    "requiredPlugins": { "type": "array" },
    "status": { "enum": ["full", "interface-only", "planned"] }
  },
  "additionalProperties": false
}
```

- [ ] **Step 6: Create skill runner test**

`tests/skill-runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  SkillRegistry,
  SkillRunner,
  type SkillManifest,
} from "../packages/skill-runner/src/index";

describe("skill registry", () => {
  test("registers and lists skills", () => {
    const registry = new SkillRegistry();
    const manifest: SkillManifest = {
      name: "test-case-gen",
      title: "测试用例生成",
      version: "0.1.0",
      description: "生成测试资产",
      workflow: "test-case-gen",
      outputs: ["TestSpec"],
    };

    registry.register(manifest);

    expect(registry.get("test-case-gen")?.workflow).toBe("test-case-gen");
    expect(registry.list()).toHaveLength(1);
    expect(new SkillRunner()).toBeInstanceOf(SkillRunner);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `bun test tests/skill-runner.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/skill-runner schemas/skill-manifest.schema.json tests/skill-runner.test.ts
git commit -m "feat: add skill runner contract"
```

## Task 5: Agent Runner And Provider Adapter

**Files:**

- Create: `packages/agent-runner/src/provider.ts`
- Create: `packages/agent-runner/src/provider-registry.ts`
- Create: `packages/agent-runner/src/agent.ts`
- Create: `packages/agent-runner/src/mock-provider.ts`
- Create: `packages/agent-runner/src/agent-runner.ts`
- Create: `packages/agent-runner/src/index.ts`
- Modify: `schemas/agent-manifest.schema.json`
- Modify: `schemas/provider-request.schema.json`
- Modify: `schemas/provider-response.schema.json`
- Test: `tests/agent-runner.test.ts`

- [ ] **Step 1: Create provider abstraction**

`packages/agent-runner/src/provider.ts`:

```ts
import type { JsonValue } from "../../core/src/index";

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  tools?: Array<{ name: string; description: string; inputSchema: JsonValue }>;
  toolChoice?: "auto" | "none" | { name: string };
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
  responseFormat?: "text" | "json" | { schema: string };
  cachePolicy?: "none" | "provider-default";
  metadata: Record<string, string>;
}

export interface ProviderResponse {
  content: string;
	  usage: {
	    inputTokens: number;
	    outputTokens: number;
	    durationMs: number;
	    cost?: number;
	  };
  raw?: JsonValue;
}

export interface ProviderAdapter {
  id: string;
  capabilities: {
    toolUse: boolean;
    structuredOutput: boolean;
    promptCaching: boolean;
    streaming: boolean;
    maxContextTokens: number;
  };
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
```

- [ ] **Step 2: Create provider registry**

`packages/agent-runner/src/provider-registry.ts`:

```ts
import type { ProviderAdapter } from "./provider";

export interface ProviderSelectionHint {
  preferred?: string[];
  needs?: Array<"toolUse" | "structuredOutput" | "promptCaching" | "streaming">;
  minContextTokens?: number;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    if (this.providers.has(provider.id))
      throw new Error(`Provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  select(hint: ProviderSelectionHint = {}): ProviderAdapter {
	    const allProviders = [...this.providers.values()];
	    const preferred = (hint.preferred ?? [])
	      .map((id) => this.providers.get(id))
	      .filter((provider): provider is ProviderAdapter => Boolean(provider));
	    const candidates = [
	      ...preferred,
	      ...allProviders.filter((provider) => !preferred.includes(provider)),
	    ];
    const provider = candidates.find((candidate) => {
      if (!candidate) return false;
      if (hint.minContextTokens && candidate.capabilities.maxContextTokens < hint.minContextTokens) return false;
      for (const need of hint.needs ?? []) {
        if (!candidate.capabilities[need]) return false;
      }
      return true;
    });
    if (!provider) throw new Error("No provider matches selection hint");
    return provider;
  }
}
```

- [ ] **Step 3: Create agent types**

`packages/agent-runner/src/agent.ts`:

```ts
import type { ProviderSelectionHint } from "./provider-registry";

export interface AgentManifest {
  name: string;
  title: string;
  version: string;
  inputSchema: string;
  outputSchema: string;
  ownerSkill: string;
  promptPath: string;
  providerHints?: ProviderSelectionHint;
}

export interface AgentRequest {
  agent: AgentManifest;
  input: unknown;
  prompt: string;
}

export interface AgentResponse<T = unknown> {
  output: T;
  providerId: string;
	  usage: {
	    inputTokens: number;
	    outputTokens: number;
	    durationMs: number;
	    cost?: number;
	  };
}
```

- [ ] **Step 4: Create mock provider**

`packages/agent-runner/src/mock-provider.ts`:

```ts
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
} from "./provider";

export type MockProviderResponder =
  | string
  | Record<string, string>
  | ((request: ProviderRequest) => string | Promise<string>);

export class MockProvider implements ProviderAdapter {
  readonly id = "mock";
  readonly capabilities = {
    toolUse: false,
    structuredOutput: true,
    promptCaching: false,
    streaming: false,
    maxContextTokens: 128000,
  };

  constructor(private readonly responder: MockProviderResponder) {}

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const agent = request.metadata.agent;
    const content =
      typeof this.responder === "function"
        ? await this.responder(request)
        : typeof this.responder === "string"
          ? this.responder
          : this.responder[agent] ?? this.responder.default ?? "{}";
    return {
      content,
      usage: { inputTokens: 0, outputTokens: 0, durationMs: 0 },
    };
  }
}
```

- [ ] **Step 5: Create AgentRunner shell**

`packages/agent-runner/src/agent-runner.ts`:

```ts
import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";

export class AgentRunner {
  constructor(private readonly providers: ProviderRegistry) {}

  async run(_agent: AgentManifest, _input: unknown): Promise<AgentResponse> {
    this.providers.select({ needs: ["structuredOutput"] });
    throw new Error("AgentRunner.run is implemented in v0.1b");
  }
}
```

- [ ] **Step 6: Create agent runner index**

`packages/agent-runner/src/index.ts`:

```ts
export type { AgentManifest, AgentRequest, AgentResponse } from "./agent";
export type {
  ProviderAdapter,
  ProviderMessage,
  ProviderRequest,
  ProviderResponse,
} from "./provider";
export { ProviderRegistry } from "./provider-registry";
export type { ProviderSelectionHint } from "./provider-registry";
export { AgentRunner } from "./agent-runner";
export { MockProvider } from "./mock-provider";
```

- [ ] **Step 7: Refine runtime schemas and test**

Refine the runtime schema files created in Task 2:

`schemas/agent-manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/agent-manifest.schema.json",
  "title": "AgentManifest",
  "type": "object",
  "required": [
    "name",
    "title",
    "version",
    "inputSchema",
    "outputSchema",
    "ownerSkill",
    "promptPath"
  ],
  "properties": {
    "name": { "type": "string" },
    "title": { "type": "string" },
    "version": { "type": "string" },
    "inputSchema": { "type": "string" },
    "outputSchema": { "type": "string" },
    "ownerSkill": { "type": "string" },
    "promptPath": { "type": "string" },
    "providerHints": { "type": "object" }
  },
  "additionalProperties": false
}
```

`schemas/provider-request.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/provider-request.schema.json",
  "title": "ProviderRequest",
  "type": "object",
  "required": ["messages", "metadata"],
  "properties": {
    "messages": { "type": "array" },
    "metadata": { "type": "object" }
  },
  "additionalProperties": true
}
```

`schemas/provider-response.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/provider-response.schema.json",
  "title": "ProviderResponse",
  "type": "object",
  "required": ["content", "usage"],
  "properties": {
    "content": { "type": "string" },
    "usage": { "type": "object" }
  },
  "additionalProperties": true
}
```

`tests/agent-runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  AgentRunner,
  MockProvider,
  ProviderRegistry,
  type ProviderRequest,
} from "../packages/agent-runner/src/index";

describe("agent runner provider abstraction", () => {
  test("mock provider returns usage metadata", async () => {
    const provider = new MockProvider('{"ok":true}');
    const request: ProviderRequest = {
      messages: [{ role: "user", content: "hello" }],
      metadata: { agent: "source-normalizer" },
    };
    const response = await provider.generate(request);
    expect(response.content).toBe('{"ok":true}');
    expect(response.usage.durationMs).toBe(0);
    expect(provider.capabilities.structuredOutput).toBe(true);
  });

  test("mock provider can route responses by agent metadata", async () => {
    const provider = new MockProvider({
      "source-normalizer": '{"draft":true}',
      "test-spec-author": '{"spec":true}',
    });
    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      metadata: { agent: "test-spec-author" },
    });
    expect(response.content).toBe('{"spec":true}');
  });

  test("provider registry selects by capability", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider("{}"));
    expect(registry.select({ needs: ["structuredOutput"] }).id).toBe("mock");
    const runner = new AgentRunner(registry);
    expect(runner).toBeInstanceOf(AgentRunner);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `bun test tests/agent-runner.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-runner tests/agent-runner.test.ts
git commit -m "feat: add agent runner provider boundary"
```

## Task 6: Artifact Repository With Backup And Hash Verify

**Files:**

- Create: `packages/artifact-repo/src/paths.ts`
- Create: `packages/artifact-repo/src/store.ts`
- Create: `packages/artifact-repo/src/index.ts`
- Test: `tests/artifact-repo.test.ts`

- [ ] **Step 1: Create path helpers**

`packages/artifact-repo/src/paths.ts`:

```ts
import { join } from "node:path";

export interface FeatureLocation {
  rootDir: string;
  project: string;
  feature: string;
}

export function featureDir(location: FeatureLocation): string {
  return join(
    location.rootDir,
    "projects",
    location.project,
    "features",
    location.feature,
  );
}

export function artifactPath(
  location: FeatureLocation,
  relativePath: string,
): string {
  if (isAbsolute(relativePath))
    throw new Error(`Artifact path must be relative: ${relativePath}`);
  const base = resolve(featureDir(location));
  const target = resolve(base, relativePath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`))
    throw new Error(`Artifact path escapes feature workspace: ${relativePath}`);
  return target;
}
```

- [ ] **Step 2: Create artifact store**

`packages/artifact-repo/src/store.ts`:

```ts
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import type { ArtifactRef, FeatureManifest } from "../../domain/src/index";
import { artifactPath, featureDir, type FeatureLocation } from "./paths";

export interface ArtifactIndex {
  project: string;
  feature: string;
  artifacts: ArtifactRef[];
}

export interface WriteArtifactOptions {
  allowedScopes?: string[];
  project?: string;
  feature?: string;
}

const WRITE_SCOPE_PREFIXES: Record<string, string[]> = {
  "feature.sources": ["sources/"],
  "feature.requirement.drafts": ["requirement/drafts/"],
  "feature.requirement.clarif": ["requirement/clarifications/"],
  "feature.requirement.confirmed": ["requirement/confirmed/"],
  "feature.requirement.spec": ["requirement/spec/"],
  "feature.test-spec": ["test-spec/"],
  "feature.exports": ["exports/"],
  "feature.reports": ["reports/"],
};

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function assertRelativeArtifactPath(relativePath: string): void {
  if (isAbsolute(relativePath) || relativePath.split("/").includes(".."))
    throw new Error(`Artifact path must stay inside feature workspace: ${relativePath}`);
}

function assertWriteScopes(
  relativePath: string,
  allowedScopes: string[] | undefined,
): void {
  if (!allowedScopes?.length) return;
  const allowedPrefixes = allowedScopes.flatMap(
    (scope) => WRITE_SCOPE_PREFIXES[scope] ?? [],
  );
  if (!allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    throw new Error(`FORBIDDEN_WRITE_SCOPE: ${relativePath}`);
  }
}

function artifactPathInFeatureDir(featureDir: string, relativePath: string): string {
  assertRelativeArtifactPath(relativePath);
  const base = resolve(featureDir);
  const target = resolve(base, relativePath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`))
    throw new Error(`Artifact path escapes feature workspace: ${relativePath}`);
  return target;
}

function readArtifactIndexInFeatureDir(
  featureDir: string,
  project = "unknown",
  feature = "unknown",
): ArtifactIndex {
  const path = artifactPathInFeatureDir(featureDir, "artifact-index.json");
  if (!existsSync(path)) return { project, feature, artifacts: [] };
  return JSON.parse(readFileSync(path, "utf8")) as ArtifactIndex;
}

export function writeArtifactInFeatureDir(
  featureDir: string,
  type: string,
  relativePath: string,
  content: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  assertWriteScopes(relativePath, options.allowedScopes);
  const path = artifactPathInFeatureDir(featureDir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const historyDir = artifactPathInFeatureDir(featureDir, ".history");
  mkdirSync(historyDir, { recursive: true });
  if (existsSync(path)) {
    const backupId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const backupPath = artifactPathInFeatureDir(
      featureDir,
      `.history/${backupId}-${relativePath.replaceAll("/", "__")}`,
    );
    renameSync(path, backupPath);
  }
  writeFileSync(path, content);
  const ref: ArtifactRef = {
    id: `${type}:${randomUUID()}`,
    type,
    path: relativePath,
    schemaVersion: "0.1",
    createdBy,
    createdAt: new Date().toISOString(),
    hash: sha256(content),
  };
  const index = readArtifactIndexInFeatureDir(
    featureDir,
    options.project,
    options.feature,
  );
  const artifacts = index.artifacts.filter((item) => item.path !== relativePath);
  artifacts.push(ref);
  writeFileSync(
    artifactPathInFeatureDir(featureDir, "artifact-index.json"),
    JSON.stringify({ ...index, artifacts }, null, 2),
  );
  return ref;
}

export function createFeatureWorkspace(location: FeatureLocation): string {
  const dir = featureDir(location);
  for (const child of [
    "sources/lanhu",
    "requirement/drafts",
    "requirement/clarifications",
    "requirement/confirmed",
    "requirement/spec",
    "test-spec",
    "exports/xmind",
    "reports",
    "traces",
    ".state",
    ".history",
  ]) {
    mkdirSync(artifactPath(location, child), { recursive: true });
  }
  const manifestPath = artifactPath(location, "feature.yaml");
  if (!existsSync(manifestPath)) {
    const manifest: FeatureManifest = {
      schemaVersion: "0.1",
      project: location.project,
      feature: location.feature,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    writeFileSync(manifestPath, YAML.stringify(manifest));
  }
  return dir;
}

export function readArtifactIndex(location: FeatureLocation): ArtifactIndex {
  const path = artifactPath(location, "artifact-index.json");
  if (!existsSync(path))
    return {
      project: location.project,
      feature: location.feature,
      artifacts: [],
    };
  return JSON.parse(readFileSync(path, "utf8")) as ArtifactIndex;
}

export function writeArtifact(
  location: FeatureLocation,
  type: string,
  relativePath: string,
  content: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  createFeatureWorkspace(location);
  return writeArtifactInFeatureDir(
    featureDir(location),
    type,
    relativePath,
    content,
    createdBy,
    { ...options, project: location.project, feature: location.feature },
  );
}

export function readArtifactVerified(
  location: FeatureLocation,
  ref: ArtifactRef,
): string {
  const content = readFileSync(artifactPath(location, ref.path), "utf8");
  const actual = sha256(content);
  if (actual !== ref.hash)
    throw new Error(`Artifact hash mismatch: ${ref.path}`);
  return content;
}
```

- [ ] **Step 3: Create index**

`packages/artifact-repo/src/index.ts`:

```ts
export type { FeatureLocation } from "./paths";
export { artifactPath, featureDir } from "./paths";
export type { ArtifactIndex, WriteArtifactOptions } from "./store";
export {
  createFeatureWorkspace,
  readArtifactIndex,
  readArtifactVerified,
  writeArtifact,
  writeArtifactInFeatureDir,
} from "./store";
```

- [ ] **Step 4: Create artifact store test**

`tests/artifact-repo.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  artifactPath,
  readArtifactIndex,
  readArtifactVerified,
  writeArtifact,
} from "../packages/artifact-repo/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("artifact store", () => {
  test("indexes artifacts, backs up overwrite, and verifies hash", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };

    const first = writeArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      '{"a":1}',
      "test",
    );
    writeArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      '{"a":2}',
      "test",
    );

    expect(readArtifactIndex(location).artifacts).toHaveLength(1);
    expect(existsSync(artifactPath(location, ".history"))).toBe(true);
    expect(existsSync(artifactPath(location, "feature.yaml"))).toBe(true);
    expect(
      readArtifactVerified(location, readArtifactIndex(location).artifacts[0]!),
    ).toBe('{"a":2}');

    writeFileSync(
      artifactPath(location, "test-spec/test-spec.json"),
      "corrupt",
    );
    expect(() => readArtifactVerified(location, first)).toThrow(
      "Artifact hash mismatch",
    );
    expect(() =>
      writeArtifact(location, "Bad", "../escape.json", "{}", "test"),
    ).toThrow("Artifact path must");
    expect(() =>
      writeArtifact(
        location,
        "TestSpec",
        "test-spec/test-spec.json",
        "{}",
        "test",
        { allowedScopes: ["feature.requirement.spec"] },
      ),
    ).toThrow("FORBIDDEN_WRITE_SCOPE");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/artifact-repo.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/artifact-repo tests/artifact-repo.test.ts
git commit -m "feat: add verified artifact store"
```

## Task 7: Workflow Engine Persistence And Human State

**Files:**

- Create: `packages/workflow-engine/src/types.ts`
- Create: `packages/workflow-engine/src/built-in-actions.ts`
- Create: `packages/workflow-engine/src/state.ts`
- Create: `packages/workflow-engine/src/persistence.ts`
- Create: `packages/workflow-engine/src/trace.ts`
- Create: `packages/workflow-engine/src/index.ts`
- Modify: `schemas/workflow-run-state.schema.json`
- Modify: `schemas/trace-event.schema.json`
- Create: `workflows/test-case-gen.yaml`
- Test: `tests/workflow-engine.test.ts`

- [ ] **Step 1: Create workflow types**

`packages/workflow-engine/src/types.ts`:

```ts
export type WorkflowNodeType =
  | "tool"
  | "agent"
  | "gate"
  | "human"
  | "artifact";
export type WorkflowNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked"
  | "cancelled";
export type WorkflowStatus =
  | "created"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled";

export interface WorkflowNodeDefinition {
  id: string;
  type: WorkflowNodeType;
  action?: string;
  agent?: string;
  gate?: string;
  dependsOn?: string[];
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  skill: string;
  nodes: WorkflowNodeDefinition[];
}

export interface WorkflowRunState {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  currentNode?: string;
  nodes: Record<
    string,
    { status: WorkflowNodeStatus; error?: string; retryable?: boolean; waitingFor?: string }
  >;
}

export interface TraceEvent {
  runId: string;
  nodeId: string;
  type:
    | "enter"
    | "exit"
    | "gate-passed"
    | "gate-failed"
    | "node-skipped"
    | "agent-call"
    | "provider-call"
    | "provider-cost-summary"
    | "plugin-action"
    | "artifact-write"
    | "knowledge-consult"
    | "knowledge-propose"
    | "human-import";
  actionId?: string;
  gateId?: string;
  artifactRefs?: string[];
  providerUsage?: {
    providerId: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    cost?: number;
  };
  message?: string;
  details?: Record<string, unknown>;
  at: string;
}
```

- [ ] **Step 2: Create state helpers**

`packages/workflow-engine/src/built-in-actions.ts`:

```ts
export const BUILT_IN_ACTION_IDS = ["knowledge.consult", "knowledge.propose"] as const;
export type BuiltInActionId = (typeof BUILT_IN_ACTION_IDS)[number];
```

`packages/workflow-engine/src/state.ts`:

```ts
import type { WorkflowDefinition, WorkflowRunState } from "./types";

export function createRunState(
  definition: WorkflowDefinition,
  runId: string,
): WorkflowRunState {
  return {
    workflowId: definition.id,
    runId,
    status: "created",
    nodes: Object.fromEntries(
      definition.nodes.map((node) => [node.id, { status: "pending" as const }]),
    ),
  };
}

function markNode(
  state: WorkflowRunState,
  nodeId: string,
  status: WorkflowRunState["nodes"][string]["status"],
  extra: Record<string, string | boolean> = {},
): WorkflowRunState {
  if (!state.nodes[nodeId]) throw new Error(`Unknown workflow node: ${nodeId}`);
  return {
    ...state,
    currentNode: nodeId,
    nodes: { ...state.nodes, [nodeId]: { status, ...extra } },
  };
}

export function markReady(
  state: WorkflowRunState,
  nodeId: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "ready"));
}

export function markRunning(
  state: WorkflowRunState,
  nodeId: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "running"));
}

export function markSucceeded(
  state: WorkflowRunState,
  nodeId: string,
): WorkflowRunState {
  const next = markNode(state, nodeId, "succeeded");
  return evaluateWorkflowStatus(next);
}

export function evaluateWorkflowStatus(state: WorkflowRunState): WorkflowRunState {
  const statuses = Object.values(state.nodes).map((node) => node.status);
  if (statuses.some((status) => status === "failed")) return { ...state, status: "failed" };
  if (statuses.some((status) => status === "blocked")) return { ...state, status: "blocked" };
  if (statuses.some((status) => status === "cancelled")) return { ...state, status: "cancelled" };
  if (statuses.some((status) => status === "waiting")) return { ...state, status: "waiting" };
  const terminal = new Set(["succeeded", "skipped"]);
  const allFinished = statuses.length > 0 && statuses.every((status) => terminal.has(status));
  return {
    ...state,
    status: allFinished ? "succeeded" : statuses.some((status) => status === "running" || status === "ready" || status === "pending") ? "running" : state.status,
  };
}

export function markFailed(
  state: WorkflowRunState,
  nodeId: string,
  error: string,
  retryable = false,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "failed", { error, retryable }));
}

export function markBlocked(
  state: WorkflowRunState,
  nodeId: string,
  error: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "blocked", { error }));
}

export function markWaiting(
  state: WorkflowRunState,
  nodeId: string,
  waitingFor: string,
): WorkflowRunState {
  return evaluateWorkflowStatus(markNode(state, nodeId, "waiting", { waitingFor }));
}
```

- [ ] **Step 3: Create persistence**

`packages/workflow-engine/src/persistence.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkflowRunState } from "./types";

export function workflowStatePath(featureDir: string, runId: string): string {
  return join(featureDir, ".state", `${runId}.json`);
}

export function saveWorkflowState(
  featureDir: string,
  state: WorkflowRunState,
): string {
  const path = workflowStatePath(featureDir, state.runId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
  return path;
}

export function loadWorkflowState(
  featureDir: string,
  runId: string,
): WorkflowRunState {
  return JSON.parse(
    readFileSync(workflowStatePath(featureDir, runId), "utf8"),
  ) as WorkflowRunState;
}
```

- [ ] **Step 4: Create trace writer**

`packages/workflow-engine/src/trace.ts`:

```ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TraceEvent } from "./types";

export function workflowTracePath(featureDir: string, runId: string): string {
  return join(featureDir, "traces", `${runId}.jsonl`);
}

export function appendTrace(featureDir: string, event: TraceEvent): string {
  const path = workflowTracePath(featureDir, event.runId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  return path;
}
```

- [ ] **Step 5: Create workflow engine index**

`packages/workflow-engine/src/index.ts`:

```ts
export type {
  TraceEvent,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeStatus,
  WorkflowNodeType,
  WorkflowRunState,
  WorkflowStatus,
} from "./types";
export {
  createRunState,
  evaluateWorkflowStatus,
  markBlocked,
  markFailed,
  markReady,
  markRunning,
  markSucceeded,
  markWaiting,
} from "./state";
export {
  loadWorkflowState,
  saveWorkflowState,
  workflowStatePath,
} from "./persistence";
export { BUILT_IN_ACTION_IDS } from "./built-in-actions";
export type { BuiltInActionId } from "./built-in-actions";
export { appendTrace, workflowTracePath } from "./trace";
```

- [ ] **Step 6: Refine workflow run state and trace schemas**

`schemas/workflow-run-state.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/workflow-run-state.schema.json",
  "title": "WorkflowRunState",
  "type": "object",
  "required": ["workflowId", "runId", "status", "nodes"],
  "properties": {
    "workflowId": { "type": "string" },
    "runId": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["created", "running", "waiting", "succeeded", "failed", "blocked", "cancelled"]
    },
    "currentNode": { "type": "string" },
    "nodes": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["status"],
        "properties": {
          "status": {
            "type": "string",
            "enum": ["pending", "ready", "running", "waiting", "succeeded", "failed", "skipped", "blocked", "cancelled"]
          },
          "error": { "type": "string" },
          "retryable": { "type": "boolean" },
          "waitingFor": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

`schemas/trace-event.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kata-agent.local/schemas/trace-event.schema.json",
  "title": "TraceEvent",
  "type": "object",
  "required": ["runId", "nodeId", "type", "at"],
  "properties": {
    "runId": { "type": "string" },
    "nodeId": { "type": "string" },
    "type": {
      "type": "string",
      "enum": ["enter", "exit", "gate-passed", "gate-failed", "node-skipped", "agent-call", "provider-call", "provider-cost-summary", "plugin-action", "artifact-write", "knowledge-consult", "knowledge-propose", "human-import"]
    },
    "actionId": { "type": "string" },
    "gateId": { "type": "string" },
    "artifactRefs": { "type": "array" },
    "providerUsage": { "type": "object" },
    "message": { "type": "string" },
    "details": { "type": "object" },
    "at": { "type": "string" }
  },
  "additionalProperties": false
}
```

- [ ] **Step 7: Create aligned test-case-gen workflow**

`workflows/test-case-gen.yaml`:

```yaml
id: test-case-gen
version: 0.1.0
skill: test-case-gen
nodes:
  - id: create-feature-workspace
    type: artifact
  - id: ingest-requirement-source
    type: tool
    action: lanhu.fetchRequirement
    dependsOn: [create-feature-workspace]
  - id: normalize-requirement-source
    type: agent
    agent: source-normalizer
    dependsOn: [ingest-requirement-source]
  - id: consult-knowledge
    type: tool
    action: knowledge.consult
    dependsOn: [normalize-requirement-source]
  - id: analyze-requirement-gaps
    type: agent
    agent: requirement-analyst
    dependsOn: [consult-knowledge]
  - id: draft-clarification-dossier
    type: agent
    agent: clarification-drafter
    dependsOn: [analyze-requirement-gaps]
  - id: render-confirmation-draft
    type: artifact
    dependsOn: [draft-clarification-dossier]
  - id: await-confirmation-result
    type: human
    dependsOn: [render-confirmation-draft]
  - id: author-requirement-spec
    type: agent
    agent: requirement-author
    dependsOn: [normalize-requirement-source, analyze-requirement-gaps, draft-clarification-dossier, await-confirmation-result]
  - id: design-test-points
    type: agent
    agent: test-point-designer
    dependsOn: [author-requirement-spec]
  - id: author-test-spec
    type: agent
    agent: test-spec-author
    dependsOn: [design-test-points, author-requirement-spec]
  - id: review-test-spec
    type: agent
    agent: test-spec-reviewer
    dependsOn: [author-test-spec, author-requirement-spec]
  - id: gate-readiness
    type: gate
    gate: requirement-test-readiness
    dependsOn: [analyze-requirement-gaps, await-confirmation-result, author-requirement-spec, author-test-spec, review-test-spec]
  - id: export-xmind
    type: tool
    action: xmind.export
    dependsOn: [gate-readiness]
  - id: propose-knowledge
    type: tool
    action: knowledge.propose
    dependsOn: [export-xmind]
  - id: write-design-report
    type: artifact
    dependsOn: [propose-knowledge]
```

- [ ] **Step 8: Create workflow engine test**

`tests/workflow-engine.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  appendTrace,
  createRunState,
  loadWorkflowState,
  markBlocked,
  markFailed,
  markRunning,
  markSucceeded,
  markWaiting,
  saveWorkflowState,
  workflowTracePath,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("workflow persistence", () => {
  test("persists waiting human confirmation state", () => {
    const root = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(root);
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    const state = markWaiting(
      createRunState(definition, "run-1"),
      "await-confirmation-result",
      "ConfirmationResult",
    );
    saveWorkflowState(root, state);
    const loaded = loadWorkflowState(root, "run-1");
    expect(loaded.status).toBe("waiting");
    expect(loaded.nodes["await-confirmation-result"]?.waitingFor).toBe(
      "ConfirmationResult",
    );
  });

  test("supports normal node transitions", () => {
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "ingest-requirement-source", type: "tool" }],
    };
    const running = markRunning(
      createRunState(definition, "run-2"),
      "ingest-requirement-source",
    );
    const succeeded = markSucceeded(running, "ingest-requirement-source");
    const failed = markFailed(running, "ingest-requirement-source", "network error");
    expect(succeeded.nodes["ingest-requirement-source"]?.status).toBe("succeeded");
    expect(succeeded.status).toBe("succeeded");
    expect(failed.nodes["ingest-requirement-source"]?.error).toBe("network error");
  });

  test("re-evaluates workflow status across multiple nodes", () => {
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [
        { id: "await-confirmation-result", type: "human" },
        { id: "author-requirement-spec", type: "agent" },
      ],
    };
    const waiting = markWaiting(
      createRunState(definition, "run-3"),
      "await-confirmation-result",
      "ConfirmationResult",
    );
    const resumed = markSucceeded(waiting, "await-confirmation-result");
    const blocked = markBlocked(resumed, "author-requirement-spec", "unconfirmed P0");
    expect(resumed.status).toBe("running");
    expect(blocked.status).toBe("blocked");
  });

  test("appends trace events for a run", () => {
    const root = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(root);
    appendTrace(root, {
      runId: "run-4",
      nodeId: "ingest-requirement-source",
      type: "enter",
      at: new Date().toISOString(),
    });
    const trace = readFileSync(workflowTracePath(root, "run-4"), "utf8");
    expect(trace).toContain('"nodeId":"ingest-requirement-source"');
  });
});
```

- [ ] **Step 9: Run tests**

Run: `bun test tests/workflow-engine.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/workflow-engine workflows/test-case-gen.yaml tests/workflow-engine.test.ts
git commit -m "feat: add persisted workflow state"
```

## Task 8: Quality Gate Functions

**Files:**

- Create: `packages/workflow-engine/src/gates.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Test: `tests/quality-gates.test.ts`

- [ ] **Step 1: Create gate functions**

`packages/workflow-engine/src/gates.ts`:

```ts
import type {
  ConfirmationResult,
  RequirementSpec,
  RequirementGapReport,
  TestSpec,
} from "../../domain/src/index";

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

export function checkRequirementClarity(
  gaps: RequirementGapReport,
  confirmation: ConfirmationResult,
): GateResult {
  const answered = new Set(
    confirmation.answers
      .filter((answer) => answer.status === "confirmed" || answer.status === "assumed")
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

export function checkEvidenceBinding(
  requirement: RequirementSpec,
): GateResult {
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
    if (rule.severity === "P1" && rule.sourceType === "assumption" && !rule.assumptionRef) {
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
        severity: "error" as const,
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
        steps: testCase.steps.map((step) => [step.action.trim(), step.expected.trim()]),
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
  const pageContractIds = new Set(requirement.pageContracts.map((page) => page.id));
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
        !testCase.automation.uiContractRefs.some((ref) => pageContractIds.has(ref))
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

export const GATE_REGISTRY = {
  "requirement-test-readiness": {
    id: "requirement-test-readiness",
    checks: [
      checkEvidenceBinding,
      checkRequirementClarity,
      checkTestSpecValidity,
      checkAutomationReadiness,
    ],
  },
} as const;
```

- [ ] **Step 2: Export gates**

Modify `packages/workflow-engine/src/index.ts` to include:

```ts
export type { GateResult, GateViolation } from "./gates";
export {
  GATE_REGISTRY,
  checkAutomationReadiness,
  checkEvidenceBinding,
  checkRequirementClarity,
  checkTestSpecValidity,
} from "./gates";
```

- [ ] **Step 3: Create gate tests**

`tests/quality-gates.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  checkAutomationReadiness,
  checkRequirementClarity,
  checkTestSpecValidity,
} from "../packages/workflow-engine/src/index";
import type {
  ConfirmationResult,
  RequirementGapReport,
  RequirementSpec,
  TestSpec,
} from "../packages/domain/src/index";

describe("quality gates", () => {
  test("blocks unresolved P0 requirement gaps", () => {
    const gaps: RequirementGapReport = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      gaps: [
        {
          id: "GAP-001",
          category: "ui-copy",
          severity: "P0",
          evidence: "missing",
          impact: "blocks automation",
          question: "保存还是确定?",
          sourceRefs: [],
        },
      ],
    };
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [],
    };
    expect(checkRequirementClarity(gaps, confirmation).passed).toBe(false);
  });

  test("blocks ready P0 cases without assertions", () => {
    const requirement: RequirementSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [
        {
          id: "REQ-001",
          text: "用户可以创建规则",
          severity: "P0",
          sourceType: "source",
          sourceRefs: ["SRC-001"],
        },
      ],
      pageContracts: [{ id: "PAGE-001", name: "规则配置", surface: "web" }],
      openItems: [],
      assumptions: [],
    };
    const spec: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "draft",
      modules: [
        {
          id: "M1",
          name: "创建",
          requirementRefs: [],
          cases: [
            {
              id: "TC-001",
              title: "创建规则",
              priority: "P0",
              requirementRefs: ["REQ-001"],
              steps: [],
              assertions: [],
              automation: {
                surface: "web",
                readiness: "ready",
                uiContractRefs: ["PAGE-001"],
                blockers: [],
              },
              traceability: { requirementRefs: [], sourceRefs: [] },
            },
          ],
        },
      ],
    };
    expect(checkAutomationReadiness(spec, requirement).passed).toBe(false);
    expect(checkTestSpecValidity(spec).passed).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/quality-gates.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-engine tests/quality-gates.test.ts
git commit -m "feat: add requirement quality gates"
```

## Task 9: Knowledge Repository Suggestion Loop

**Files:**

- Create: `packages/knowledge-repo/src/store.ts`
- Create: `packages/knowledge-repo/src/index.ts`
- Test: `tests/knowledge-repo.test.ts`

- [ ] **Step 1: Create knowledge suggestion store**

`packages/knowledge-repo/src/store.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeSuggestion } from "../../domain/src/index";

export interface KnowledgeLocation {
  rootDir: string;
  project: string;
}

export function knowledgeDir(location: KnowledgeLocation): string {
  return join(location.rootDir, "projects", location.project, "knowledge");
}

export function writeSuggestion(
  location: KnowledgeLocation,
  suggestion: KnowledgeSuggestion,
): string {
  const dir = join(knowledgeDir(location), "suggestions");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}-${suggestion.category}.json`);
  writeFileSync(path, JSON.stringify(suggestion, null, 2));
  return path;
}

export function readSuggestion(path: string): KnowledgeSuggestion {
  return JSON.parse(readFileSync(path, "utf8")) as KnowledgeSuggestion;
}
```

- [ ] **Step 2: Create knowledge repository index**

`packages/knowledge-repo/src/index.ts`:

```ts
export type { KnowledgeLocation } from "./store";
export { knowledgeDir, readSuggestion, writeSuggestion } from "./store";
```

- [ ] **Step 3: Create knowledge repository test**

`tests/knowledge-repo.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  readSuggestion,
  writeSuggestion,
} from "../packages/knowledge-repo/src/index";
import type { KnowledgeSuggestion } from "../packages/domain/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("knowledge repository", () => {
  test("writes and reads knowledge suggestions", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const suggestion: KnowledgeSuggestion = {
      schemaVersion: "0.1",
      category: "product-decision",
      confidence: "high",
      sourceArtifact: "requirement/confirmed/confirmation-result.json",
      content: "列表默认按创建时间倒序。",
      reason: "产品确认",
    };
    const path = writeSuggestion({ rootDir, project: "demo" }, suggestion);
    expect(readSuggestion(path).content).toContain("创建时间倒序");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/knowledge-repo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge-repo tests/knowledge-repo.test.ts
git commit -m "feat: add knowledge suggestion store"
```

## Task 10: Minimal CLI For Help, Status, Resume Stub, And Confirmation Import

**Files:**

- Create: `apps/cli/src/index.ts`
- Test: `tests/cli.smoke.test.ts`

- [ ] **Step 1: Create CLI entry**

`apps/cli/src/index.ts`:

```ts
#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { writeArtifactInFeatureDir } from "../../../packages/artifact-repo/src/index";
import { SCHEMA_VERSION } from "../../../packages/core/src/index";
import {
  appendTrace,
  loadWorkflowState,
  markSucceeded,
  saveWorkflowState,
} from "../../../packages/workflow-engine/src/index";

const [, , group, subcommand, ...args] = Bun.argv;
const command = group === "workflow" || group === "confirmation" ? `${group} ${subcommand ?? ""}`.trim() : group;

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireArg(name: string): string {
  const value = argValue(name);
  if (!value) {
    console.error(`Missing required argument: ${name}`);
    process.exit(1);
  }
  return value;
}

if (!command || command === "help") {
  console.log(
    "kata-agent commands: workflow status, workflow resume, confirmation import",
  );
  process.exit(0);
}

if (command === "test-case-gen") {
  console.error("test-case-gen start is implemented in v0.1b");
  process.exit(1);
}

if (command === "workflow status") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const state = loadWorkflowState(featureDir, runId);
  console.log(
    JSON.stringify(
      { runId, status: state.status, currentNode: state.currentNode },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (command === "workflow resume") {
  console.error("workflow resume is implemented in v0.1b");
  process.exit(1);
}

if (command === "confirmation import") {
  const featureDir = requireArg("--feature-dir");
  const runId = requireArg("--run");
  const file = requireArg("--file");
  const rawConfirmation = readFileSync(file, "utf8");
  const confirmation = JSON.parse(rawConfirmation) as {
    schemaVersion?: unknown;
    answers?: unknown;
  };
  if (
    // v0.1b: validate ConfirmationResult with Ajv instead of shape checks.
    confirmation.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(confirmation.answers)
  ) {
    console.error(
      "Invalid ConfirmationResult: expected schemaVersion 0.1 and answers[]",
    );
    process.exit(1);
  }
  const state = loadWorkflowState(featureDir, runId);
  const waitingNode =
    state.currentNode && state.nodes[state.currentNode]?.status === "waiting"
      ? state.currentNode
      : Object.entries(state.nodes).find(
          ([, node]) =>
            node.status === "waiting" &&
            node.waitingFor === "ConfirmationResult",
        )?.[0];
  if (!waitingNode) {
    console.error(
      `No workflow node is waiting for ConfirmationResult in run ${runId}`,
    );
    process.exit(1);
  }
  const ref = writeArtifactInFeatureDir(
    featureDir,
    "ConfirmationResult",
    "requirement/confirmed/confirmation-result.json",
    rawConfirmation,
    "confirmation import",
    { allowedScopes: ["feature.requirement.confirmed"] },
  );
  saveWorkflowState(featureDir, markSucceeded(state, waitingNode));
  appendTrace(featureDir, {
    runId,
    nodeId: waitingNode,
    type: "human-import",
    artifactRefs: [ref.id],
    at: new Date().toISOString(),
  });
  console.log(`confirmation imported for ${runId}:${waitingNode}`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
```

- [ ] **Step 2: Create CLI smoke test**

`tests/cli.smoke.test.ts`:

```ts
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createRunState,
  markWaiting,
  saveWorkflowState,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("cli", () => {
  test("prints help", async () => {
    const proc = Bun.spawn(["bun", "apps/cli/src/index.ts", "help"], {
      cwd: repoRoot,
    });
    const output = await new Response(proc.stdout).text();
    expect(output).toContain("kata-agent commands");
  });

  test("workflow resume is explicit v0.1b scope", async () => {
    const proc = Bun.spawn(
      ["bun", "apps/cli/src/index.ts", "workflow", "resume", "--run", "run-1"],
      { cwd: repoRoot },
    );
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(error).toContain("workflow resume is implemented in v0.1b");
  });

  test("imports confirmation and marks waiting node succeeded", async () => {
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
        createRunState(definition, "run-1"),
        "await-confirmation-result",
        "ConfirmationResult",
      ),
    );
    const confirmationPath = join(featureDir, "confirmation-result.json");
    writeFileSync(
      confirmationPath,
      JSON.stringify({ schemaVersion: "0.1", answers: [] }),
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
        "run-1",
        "--file",
        confirmationPath,
      ],
      { cwd: repoRoot },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    const saved = JSON.parse(
      readFileSync(join(featureDir, ".state", "run-1.json"), "utf8"),
    );

    expect(exitCode).toBe(0);
    expect(output).toContain("confirmation imported");
    expect(saved.nodes["await-confirmation-result"].status).toBe("succeeded");
    expect(
      readFileSync(
        join(featureDir, "requirement", "confirmed", "confirmation-result.json"),
        "utf8",
      ),
    ).toContain('"answers":[]');
    expect(readFileSync(join(featureDir, "traces", "run-1.jsonl"), "utf8")).toContain(
      '"type":"human-import"',
    );
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/cli.smoke.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli tests/cli.smoke.test.ts
git commit -m "feat: add minimal cli entry"
```

## Task 11: Manifests And Dangling Reference Test

**Files:**

- Create: `skills/test-case-gen/skill.yaml`
- Create: `skills/knowledge-keeper/skill.yaml`
- Create: `agents/*/agent.yaml`
- Create: `agents/*/prompt.md`
- Test: `tests/manifest-references.test.ts`

- [ ] **Step 1: Create two v0.1 skill manifests**

`skills/test-case-gen/skill.yaml`:

```yaml
name: test-case-gen
title: 测试用例生成
version: 0.1.0
description: 从蓝湖、PRD 或补充说明中补全需求，生成产品确认稿、完整需求文档、TestSpec 和 XMind。
workflow: test-case-gen
inputs:
  schema: TestCaseGenInput
outputs:
  - RequirementSourceBundle
  - RequirementDraft
  - KnowledgeConsultResult
  - RequirementAnalysisInput
  - RequirementGapReport
  - ClarificationDossier
  - ConfirmationDraft
  - ConfirmationResult
  - RequirementAuthorInput
  - RequirementSpec
  - TestPointSet
  - TestSpecAuthorInput
  - TestSpec
  - TestSpecReviewerInput
  - ReviewReport
  - XMindExport
  - KnowledgeSuggestion
  - DesignReport
requiredPlugins:
  - lanhu
  - xmind
```

`skills/knowledge-keeper/skill.yaml`:

```yaml
name: knowledge-keeper
title: 知识库维护
version: 0.1.0
description: 审核 KnowledgeSuggestion 并维护项目知识库。
workflow: knowledge-keeper
status: interface-only
```

- [ ] **Step 2: Create agent manifests**

`agents/source-normalizer/agent.yaml`:

```yaml
name: source-normalizer
title: 需求源材料规整 Agent
version: 0.1.0
inputSchema: RequirementSourceBundle
outputSchema: RequirementDraft
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/requirement-analyst/agent.yaml`:

```yaml
name: requirement-analyst
title: 需求缺口分析 Agent
version: 0.1.0
inputSchema: RequirementAnalysisInput
outputSchema: RequirementGapReport
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/clarification-drafter/agent.yaml`:

```yaml
name: clarification-drafter
title: 需求澄清卷宗起草 Agent
version: 0.1.0
inputSchema: RequirementGapReport
outputSchema: ClarificationDossier
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/requirement-author/agent.yaml`:

```yaml
name: requirement-author
title: 需求规格定稿 Agent
version: 0.1.0
inputSchema: RequirementAuthorInput
outputSchema: RequirementSpec
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/test-point-designer/agent.yaml`:

```yaml
name: test-point-designer
title: 测试点设计 Agent
version: 0.1.0
inputSchema: RequirementSpec
outputSchema: TestPointSet
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/test-spec-author/agent.yaml`:

```yaml
name: test-spec-author
title: 测试规格编写 Agent
version: 0.1.0
inputSchema: TestSpecAuthorInput
outputSchema: TestSpec
ownerSkill: test-case-gen
promptPath: prompt.md
```

`agents/test-spec-reviewer/agent.yaml`:

```yaml
name: test-spec-reviewer
title: 测试规格审查 Agent
version: 0.1.0
inputSchema: TestSpecReviewerInput
outputSchema: ReviewReport
ownerSkill: test-case-gen
promptPath: prompt.md
```

- [ ] **Step 3: Create first-stage agent prompt shells**

Create `prompt.md` beside every first-stage `agent.yaml`. Each prompt must be Chinese and must include exactly these top-level headings:

```md
# 角色

# 职责

# 输入

# 输出

# 工作步骤

# 边界

# 完成标准
```

The prompt shell may stay concise in v0.1a, but it must name the agent responsibility, allowed input schema, required output schema, and explicit boundaries. v0.1b will refine prompts against eval fixtures.

- [ ] **Step 4: Create dangling schema, prompt, and workflow reference test**

`tests/manifest-references.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "bun:test";
import { SCHEMA_REGISTRY } from "../packages/domain/src/index";
import { BUILT_IN_ACTION_IDS, GATE_REGISTRY } from "../packages/workflow-engine/src/index";

const schemaNames = new Set(Object.keys(SCHEMA_REGISTRY));

const promptHeadings = [
  "# 角色",
  "# 职责",
  "# 输入",
  "# 输出",
  "# 工作步骤",
  "# 边界",
  "# 完成标准",
];
const gateNames = new Set(Object.keys(GATE_REGISTRY));
const builtInActionIds = new Set(BUILT_IN_ACTION_IDS);
const nodeTypes = new Set(["tool", "agent", "gate", "human", "artifact"]);

function yamlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map((entry) => join(root, String(entry)))
    .filter((path) => path.endsWith(".yaml"));
}

describe("manifest schema references", () => {
  test("agent, skill, and plugin schemas are known", () => {
    const files = [
      ...yamlFiles("agents"),
      ...yamlFiles("skills"),
      ...yamlFiles("plugins"),
    ];
    for (const file of files) {
      const doc = YAML.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      for (const key of ["inputSchema", "outputSchema"]) {
        const value = doc[key];
        if (typeof value === "string")
          expect(schemaNames.has(value), `${file} ${key}=${value}`).toBe(true);
      }
      const inputs = doc.inputs as { schema?: string } | undefined;
      if (inputs?.schema)
        expect(
          schemaNames.has(inputs.schema),
          `${file} inputs.schema=${inputs.schema}`,
        ).toBe(true);
      const outputs = doc.outputs as string[] | undefined;
      for (const output of outputs ?? [])
        expect(schemaNames.has(output), `${file} output=${output}`).toBe(true);
      const promptPath = doc.promptPath as string | undefined;
      if (promptPath) {
        const fullPromptPath = join(dirname(file), promptPath);
        expect(
          existsSync(fullPromptPath),
          `${file} promptPath=${promptPath}`,
        ).toBe(true);
        const prompt = readFileSync(fullPromptPath, "utf8");
        for (const heading of promptHeadings) expect(prompt).toContain(heading);
      }
      const actions = doc.actions as
        | Array<{ inputSchema?: string; outputSchema?: string }>
        | undefined;
      for (const action of actions ?? []) {
        if (action.inputSchema)
          expect(
            schemaNames.has(action.inputSchema),
            `${file} action.inputSchema=${action.inputSchema}`,
          ).toBe(true);
        if (action.outputSchema)
          expect(
            schemaNames.has(action.outputSchema),
            `${file} action.outputSchema=${action.outputSchema}`,
          ).toBe(true);
      }
    }
  });

  test("non-interface skill workflows exist", () => {
    for (const file of yamlFiles("skills")) {
      const doc = YAML.parse(readFileSync(file, "utf8")) as { workflow?: string; status?: string };
      if (!doc.workflow || doc.status === "interface-only") continue;
      expect(existsSync(join("workflows", `${doc.workflow}.yaml`)), `${file} workflow=${doc.workflow}`).toBe(true);
    }
  });

  test("workflow node references are resolvable", () => {
    const agentNames = new Set(
      yamlFiles("agents").map((file) => (YAML.parse(readFileSync(file, "utf8")) as { name: string }).name),
    );
    const actionIds = new Set([
      ...builtInActionIds,
      ...yamlFiles("plugins").flatMap((file) => {
        const doc = YAML.parse(readFileSync(file, "utf8")) as { actions?: Array<{ id: string }> };
        return (doc.actions ?? []).map((action) => action.id);
      }),
    ]);
    for (const file of yamlFiles("workflows")) {
      const workflow = YAML.parse(readFileSync(file, "utf8")) as {
        nodes: Array<{ id: string; type: string; agent?: string; action?: string; gate?: string; dependsOn?: string[] }>;
      };
      const nodeIds = new Set(workflow.nodes.map((node) => node.id));
      expect(nodeIds.size, `${file} duplicate node ids`).toBe(workflow.nodes.length);
      const nodeIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]));
      for (const node of workflow.nodes) {
        expect(nodeTypes.has(node.type), `${file} node type=${node.type}`).toBe(true);
        if (node.agent) expect(agentNames.has(node.agent), `${file} agent=${node.agent}`).toBe(true);
        if (node.action) expect(actionIds.has(node.action), `${file} action=${node.action}`).toBe(true);
        if (node.gate) expect(gateNames.has(node.gate), `${file} gate=${node.gate}`).toBe(true);
        for (const dependency of node.dependsOn ?? []) {
          expect(nodeIds.has(dependency), `${file} dependsOn=${dependency}`).toBe(true);
          expect(nodeIndex.get(dependency)!, `${file} dependency order=${dependency}->${node.id}`).toBeLessThan(nodeIndex.get(node.id)!);
        }
      }
    }
  });
});
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/manifest-references.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills agents tests/manifest-references.test.ts
git commit -m "feat: add checked skill and agent manifests"
```

## Task 12: Full Verification

**Files:**

- Create: `tests/integration.foundation-smoke.test.ts`

- [ ] **Step 1: Create foundation integration smoke test**

`tests/integration.foundation-smoke.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFeatureWorkspace,
  featureDir,
  readArtifactVerified,
  writeArtifact,
} from "../packages/artifact-repo/src/index";
import {
  appendTrace,
  createRunState,
  markWaiting,
  saveWorkflowState,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("v0.1a foundation smoke", () => {
  test("persists a human-gated run with artifact and trace", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const dir = createFeatureWorkspace(location);
    const ref = writeArtifact(
      location,
      "ClarificationDossier",
      "requirement/clarifications/clarification-dossier.json",
      '{"schemaVersion":"0.1"}',
      "test",
    );
    const definition: WorkflowDefinition = {
      id: "test-case-gen",
      version: "0.1.0",
      skill: "test-case-gen",
      nodes: [{ id: "await-confirmation-result", type: "human" }],
    };
    saveWorkflowState(
      dir,
      markWaiting(
        createRunState(definition, "run-1"),
        "await-confirmation-result",
        "ConfirmationResult",
      ),
    );
    appendTrace(dir, {
      runId: "run-1",
      nodeId: "await-confirmation-result",
      type: "enter",
      artifactRefs: [ref.id],
      at: new Date().toISOString(),
    });

    expect(readArtifactVerified(location, ref)).toBe('{"schemaVersion":"0.1"}');
    expect(
      readFileSync(join(featureDir(location), ".state", "run-1.json"), "utf8"),
    ).toContain('"waiting"');
    expect(
      readFileSync(join(featureDir(location), "traces", "run-1.jsonl"), "utf8"),
    ).toContain("await-confirmation-result");
  });
});
```

- [ ] **Step 2: Run integration smoke**

Run: `bun test tests/integration.foundation-smoke.test.ts`

Expected: PASS.

- [ ] **Step 3: Run all tests**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 5: Commit integration smoke**

Commit the integration smoke test and any generated lockfile updates:

```bash
git add tests/integration.foundation-smoke.test.ts bun.lock
git commit -m "test: add foundation integration smoke"
```

## Self-Review

Spec coverage:

- Workflow step alignment: Task 7 workflow includes `design-test-points` and `write-design-report`.
- Workspace foundation: Task 1 creates root and per-workspace `package.json` files so Bun workspaces resolve consistently.
- Full v0.1 schema list: Task 2 covers all v0.1 domain contracts named in the spec, including `KnowledgeConsultResult`, `RequirementAnalysisInput`, `RequirementAuthorInput`, `TestPointSet`, `ReviewReport`, `XMindExport`, `DesignReport`, and `KnowledgeSuggestion`.
- Closed enum contracts: Task 2 requires JSON Schema enum constraints for feature status, requirement status, open item status, workflow status, node status, and trace event type.
- Feature manifest: Task 2 defines `FeatureManifest` for `feature.yaml`.
- Skill runner: Task 4 creates `SkillManifest`, `SkillRegistry`, and schema coverage.
- Agent runner: Task 5 creates `ProviderAdapter`, `ProviderRegistry`, request/response types, usage metadata, provider capabilities, routeable mock provider, and `AgentRunner` shell.
- Prompt contract: Task 5 requires `promptPath`; Task 11 creates Chinese `prompt.md` shells and verifies required prompt headings.
- Runtime schemas: Tasks 3, 4, 5, and 7 create `PluginManifest`, `SkillManifest`, `AgentManifest`, `ProviderRequest`, `ProviderResponse`, `WorkflowRunState`, and `TraceEvent` schemas.
- Provider-agnostic boundary: Task 5 establishes provider interface before real OpenAI/Codex/Claude/Hermes adapters.
- Human node persistence: Task 7 persists `waiting` state to `.state/{runId}.json`; Task 10 implements a minimal `confirmation import` path that validates JSON shape and marks the waiting human node as succeeded.
- Quality gates: Task 8 implements G2/G3/G4/G5 as concrete functions with tests and registers the `requirement-test-readiness` gate.
- Plugin permissions: Task 3 adds permissions and mechanical output constraints for requirement-source, artifact-export, notification, issue-tracker, automation, and rule-source plugins.
- Artifact repository promises: Task 6 implements backup and hash verification; Ajv-backed artifact validation remains v0.1b scope after schema files stabilize.
- Trace coverage: Task 7 adds append-only JSONL trace events; Task 12 includes trace in the integration smoke.
- Knowledge feedback loop: Task 9 adds `KnowledgeSuggestion` storage and Task 7 includes `consult-knowledge` / `propose-knowledge` as built-in tool actions, not a separate node type.
- Stub overreach: Task 11 creates only `test-case-gen` and `knowledge-keeper` skill manifests; future skills remain documented, not frozen as files.
- Old kata migration: Rule Store and Source Repo are explicit reserved concepts in the spec; their concrete loaders are deferred to v0.1b+ instead of being hidden inside prompts.

Known remaining gaps after self-review:

- Schema depth: v0.1a schemas enforce top-level contracts plus the closed enums required for runtime safety. v0.1b must add broader Ajv validation for nested structures before real agent outputs are trusted.
- Workflow executor: v0.1a has state, persistence, trace, and CLI import, but no full executor loop. `workflow resume` remains a command placeholder until v0.1b.
- Prompt quality: v0.1a enforces Chinese prompt files and required sections. v0.1b must refine actual prompts against eval fixtures and poor-PRD examples.
- Config and secrets: plugin manifests declare secrets, but there is no global config loader, `.env` loader, or provider selection strategy yet. This blocks real Lanhu and real model providers.
- Rule Store: rules are first-class in the spec, but loaders and prompt injection are deferred. This must land before prompts become project-specific.
- Source Repo: `SourceRepoRef` remains conceptual. It is required before `hotfix-case-gen`, `static-scan`, or implementation-aware test design become real.
- Knowledge lifecycle: v0.1a writes suggestions; accept/reject/search flows are deferred. Without that, knowledge feedback is visible but not yet productive.
- Schema evolution: `schemaVersion` is centralized, but no migration strategy exists yet for v0.2 artifacts.
- Eval strategy: no `evals/` fixtures exist in v0.1a. Prompt and provider changes should not be judged only by subjective review.

## Iteration Roadmap

### v0.1a Contract Foundation

Implement this plan exactly: domain contracts, manifests, plugin/agent/skill registries, artifact repository, workflow state, trace, human confirmation import, and foundation smoke tests.

Success criteria:

- all declared v0.1a files exist
- all schemas referenced by manifests exist
- all agent prompts exist and pass heading checks
- state/artifact/trace smoke test passes

### v0.1b Runtime Loop

Make `test-case-gen` run end-to-end with mocks.

Scope:

- `WorkflowExecutor` dispatch table for artifact, tool, agent, gate, and human nodes
- `AgentRunner` with prompt rendering, Rule Store injection, schema validation, retry on invalid structured output, and trace events
- `ConfigLoader` for `.env`, project config, provider selection, and plugin secrets
- Ajv validation in Artifact Repository and CLI import
- `knowledge-keeper` accept/reject/search commands
- `workflow resume` implementation
- eval fixtures for poor Lanhu PRDs and expected ClarificationDossier outputs

Success criteria:

- mocked Lanhu source -> ClarificationDossier -> confirmation import -> RequirementSpec -> test points -> TestSpec -> mocked XMind export
- G2/G3/G4/G5 gates run as code
- every node appends trace
- prompts are revised through at least one eval fixture

### v0.1c Real Lanhu And XMind Demo

Replace mocks with real deterministic adapters.

Scope:

- thin Lanhu plugin with cookie/env config and raw source artifact capture
- real XMind export from `TestSpec`
- first OpenAI/Codex provider adapter or local provider adapter
- one real feature demo from Lanhu URL to XMind output

Success criteria:

- demo produces `requirement-spec.json`, `test-spec.json`, `test-spec.md`, XMind file, trace, and design report
- no manual intervention except importing product confirmation JSON
- generated TestSpec preserves requirement evidence and automation readiness blockers

### v0.2 Automation Skills

Start `ui-script-gen` after `test-case-gen` is stable.

Scope:

- `FlowSpec`, `RunPlan`, `RunRecord`, `EvidencePack`
- Playwright surface plugin
- future setup/fixture plugin for SQL preconditions and platform setup, including old `dtstack-cli`-style capabilities when product demand is confirmed
- script generation from `TestSpec`
- strict assertion policy with L1-L5 assertion layers
- failure-to-report bridge into `report-gen`

Do not start mobile or desktop automation until web automation has traceable, repeatable success.

### v0.3 Daily QA Skills

Bring over old kata daily capabilities with clean schemas:

- `hotfix-case-gen`: issue/source context -> focused regression TestSpec
- `report-gen`: bug report, conflict report, and automation failure report
- `static-scan`: diff/source scan -> reproducible `RiskPoint` / `InspectionReport`

### v0.4 External Collaboration Plugins

Add non-core plugins after artifact and trace semantics are stable:

- DingTalk notification as human workflow output, not autonomous approval
- Zentao issue sync from explicit `IssueDraft`
- optional Lanhu write-back only after manual confirmation

### v0.5 macOS App

Build the desktop app only after CLI workflows are stable.

The app should be a workflow console over the same engine: run list, current node, artifacts, traces, confirmation import, knowledge suggestions, and XMind preview. It should not fork business logic from the CLI/runtime packages.

Deferred to v0.1c or later:

- Real Lanhu HTTP fetch.
- Real XMind binary export.
- Real model provider calls.
- Markdown confirmation import.
- DingTalk, Zentao, Playwright, mobile, desktop, and static-scan plugins.
