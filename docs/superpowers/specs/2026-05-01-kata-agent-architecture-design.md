# kata-agent Architecture Design

> **Status**: Draft for external review
> **Date**: 2026-05-01
> **Scope**: kata-agent v0.1 architecture, first-stage `test-case-gen`, and extension points.

## 1. Background

kata-agent is a new greenfield Agentic QA Workflow Engine.

The existing kata project proved that an AI-assisted QA workflow is useful, especially around test case generation and UI automation. It also exposed structural problems: prompts are unclear, boundaries are blurry, directories are hard to reason about, and automation becomes fragile when upstream requirements are vague.

The new project must not inherit the old architecture. The reusable product insight is the workflow shape:

```text
low-quality requirement
  -> requirement clarification
  -> test asset generation
  -> automation-ready contract
  -> future script generation and reports
```

## 2. North Star

kata-agent's first goal is not to generate more test cases.

It is to transform low-quality requirements into high-quality test assets that are:

- confirmable by product owners
- useful to frontend developers
- reviewable by QA
- consumable by automation workflows
- traceable back to sources and decisions

The first stage focuses on Lanhu PRD input because Lanhu requirements are often incomplete. The agent must expose missing details, generate a product confirmation draft, consume confirmation results, and produce a structured `TestSpec`.

## 3. Goals

v0.1 must define the full agent architecture and deliver the first useful chain in phases:

```text
Lanhu PRD
  -> test-case-gen
  -> clarification-dossier.json
  -> confirmation-draft.md
  -> confirmation-result.json
  -> requirement-spec.md/json
  -> test-points.json
  -> test-spec.md/json
  -> XMind
```

v0.1 must establish:

- Skill protocol with executable Skill Runner
- Workflow Engine (state, persistence, trace, gates, resume)
- Agent Runner with Provider Registry
- Provider Adapter abstraction
- Plugin Runtime with permission-checked Plugin Actions
- Artifact Repository
- Knowledge Repository
- Schema contracts with single registry
- first-stage `test-case-gen`
- lightweight Lanhu plugin
- XMind export plugin

## 4. Non-Goals

v0.1 does not implement:

- DingTalk auto-send or reply collection
- Zentao bug creation
- real Playwright script generation
- mobile automation
- desktop automation
- full static-scan plugin
- visual desktop application
- plugin marketplace
- generic personal-agent behavior

These are reserved extension points. Reserved extensions should be documented but should not create real manifests until their contracts are ready.

## 5. Terminology Decisions

| Concept                                         | Name                 | Rationale                                                          |
| ----------------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| User-facing workflow ability                    | Skill                | Replaces old `Capability`                                          |
| Mind map export                                 | XMind                | Replaces old `MindMapExport`                                       |
| Requirement grouping directory                  | features             | Plural; one feature folder per requirement                         |
| Human-readable + machine-readable test contract | TestSpec             | Canonical testing artifact (replaces old `Archive`)                |
| Confirmed full requirement contract             | RequirementSpec      | Symmetric with `TestSpec`; status field carries confirmation level |
| Bundled clarification questions + assumptions   | ClarificationDossier | "Dossier" = formal record file; replaces colloquial `pack`         |
| Rendered confirmation draft for product owner   | ConfirmationDraft    | Markdown render of `ClarificationDossier`, no new facts            |
| Imported product answers                        | ConfirmationResult   | JSON canonical                                                     |
| Plugin-exposed callable unit                    | Plugin Action        |                                                                    |

`TestSpec`, `RequirementSpec`, `ClarificationDossier`, `ConfirmationDraft`, `ConfirmationResult` together form the test-case-gen artifact spine. The old kata `Archive` concept is intentionally not migrated.

## 6. Component Status Matrix

| Component         | v0.1a                          | v0.1b                        | v0.1c                    | Notes                                     |
| ----------------- | ------------------------------ | ---------------------------- | ------------------------ | ----------------------------------------- |
| Monorepo skeleton | full                           | full                         | full                     | TypeScript + Bun                          |
| Domain schema     | full                           | full                         | full                     | All v0.1 schemas exist                    |
| Artifact Repository | interface + backup/hash checks | full                         | full                     | v0.1b adds Ajv schema validation          |
| Plugin Runtime    | registry + permission contracts | full                         | full                     | permissions and Plugin Action registry    |
| Lanhu Plugin      | mock action                    | mock action                  | full                     | real HTTP fetch only in v0.1c             |
| XMind Plugin      | mock export                    | mock export                  | full                     | real export only in v0.1c                 |
| Agent Runner      | interface                      | full mock provider           | full provider-ready      | real model calls can come later           |
| Prompt Contract   | Chinese shells                 | eval-refined prompts         | provider-tuned prompts   | prompt structure is tested, not informal  |
| Provider Registry + Adapter | interface             | mock provider                | provider-ready           | provider-agnostic contract                |
| Skill Runner      | interface                      | workflow start/status bridge | full CLI-backed entry    | loads and validates SkillManifest         |
| Workflow Engine   | state model + trace append     | persisted execution          | demo-ready               | includes human node/resume                |
| Trace Log         | append-only events             | provider/artifact provenance | report/eval ready        | powers design reports and cost analysis   |
| Quality Gates     | G2/G3/G4/G5 foundation         | executor-dispatched gates    | G1-G6 implemented        | gates must be code, not prompt text       |
| Knowledge Repository | schema + suggestion store + consult contract | suggestion loop | search + accept | first loop around product confirmations   |
| CLI               | minimal status/import          | start/status/resume/import   | e2e demo commands        | CLI required for human gate               |
| Rule Store        | reserved concept               | load + merge                 | prompt/gate enforced     | global rules < project rules < run input  |
| Source Repo       | reserved concept               | read-only refs               | hotfix/static-scan ready | replaces old `.repos/` with explicit refs |
| Stub Skills       | no real manifests              | documentation only           | add when needed          | avoid freezing unused contracts           |

## 7. Architecture

Workflow Engine is the hub. Agent Runner, Plugin Runtime, Artifact Repository, Knowledge Repository, and Trace Log are services used by workflow nodes.

```text
                 Interface Layer
                       |
                 Skill Runner
                       |
                 Workflow Engine
        /----------/----|----\-----------\
 Agent Runner   Plugin Runtime  Artifact Repo  Knowledge Repo
        \----------\----|----/-----------/
                   Trace Log
```

This is not a strict vertical chain. The Workflow Engine directly invokes agent nodes, plugin-action nodes, artifact nodes, gate nodes, and human nodes.

### Interface Layer

Entrypoints such as CLI, future desktop app, Codex, MCP, and webhooks.

v0.1 implements CLI because human confirmation and resume need an executable interface.

### Skill Runner

Loads Skill manifests, resolves intent, validates Skill inputs, and starts a workflow run.

v0.1a only ships the manifest registry; v0.1b ships `SkillRunner.start(skillName, input): RunHandle`.

### Workflow Engine

The execution kernel. It controls node order, state, retries, human gates, quality gates, artifact passing, trace, and resume.

The Workflow Engine is the **only** flow controller. Plugins, agents, and CLI commands never branch the flow themselves.

### Agent Runner

Loads agent manifests, renders Chinese prompts, calls Provider Adapters via the Provider Registry, validates structured output, retries invalid output, and writes trace.

Agents do local intelligent work only — no file writes, no network, no flow decisions.

### Provider Registry + Provider Adapter

Provider Adapter is the model boundary. Provider Registry resolves which adapter answers an agent request based on `AgentManifest.providerHints` and runtime preference.

Every provider must implement:

```ts
interface ProviderAdapter {
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

Provider responses must include usage metadata (input/output tokens, duration, optional cost) so future model selection can reason about cost, latency, and output size.

### Plugin Runtime

Plugin Runtime loads plugin manifests, registers Plugin Actions, checks permissions, and executes plugin handlers.

Plugin Action handlers are **side-effect declared** rather than deterministic — each `PluginActionManifest.sideEffects` declares network usage, artifact writes, and external state. The Workflow Engine uses these declarations to choose retry/cache strategy.

Plugins do not orchestrate workflow, do not write Knowledge directly, and do not branch flow.

### Artifact Repository

Manages artifact paths, schema validation, indexes, overwrite backup, hash verification, and `ArtifactRef` issuance.

Agents and plugins must not write arbitrary files. Plugin write scopes are enforced against `PluginPermissions.writeScopes` at write time.

### Trace Log

Trace Log appends run events as JSON Lines under `traces/`.

Trace events record node entry/exit, gate pass/fail, skipped nodes, provider calls (with usage), provider cost summaries, plugin actions, artifact writes, knowledge consult/propose, and human imports. Events include the relevant `actionId` or `gateId` when applicable. They are not product-facing artifacts, but they are required for design reports, debugging, cost analysis, and future evals.

### Knowledge Repository

Stores reusable facts and experience across features and runs: business rules, terms, product decisions, pitfalls, surface knowledge, and future automation knowledge.

Agents and plugins emit `KnowledgeSuggestion`; only the `knowledge-keeper` Skill applies suggestions to canonical knowledge files.

## 8. Repository Layout

```text
kata-agent/
├── apps/
│   └── cli/
├── packages/
│   ├── core/                  # SCHEMA_VERSION, error codes, JSON utils, ConfigLoader interface
│   ├── domain/                # All v0.1 schemas + single SCHEMA_REGISTRY
│   ├── workflow-engine/       # State machine, persistence, trace, gates, executor
│   ├── agent-runner/          # Prompt render, JSON validate, retry, ProviderRegistry
│   ├── skill-runner/          # SkillManifest registry + SkillRunner.start
│   ├── plugin-runtime/        # PluginManifest registry, permissions, action registry
│   ├── artifact-repo/         # Path resolver, write/read, backup, hash, index
│   └── knowledge-repo/        # KnowledgeSuggestion ingest, search, accept/reject
├── plugins/
│   ├── lanhu/                 # source plugin (only outputs RequirementSourceBundle)
│   └── xmind/                 # export plugin (only outputs XMindExport)
├── skills/
│   ├── test-case-gen/
│   └── knowledge-keeper/
├── workflows/                 # one *.yaml per Skill workflow
├── agents/                    # agent.yaml + prompt.md (Chinese, role-bounded)
├── schemas/                   # one *.schema.json per Domain contract
├── docs/
└── projects/                  # runtime state lives here, not in framework code
```

Prompts are colocated with `agent.yaml` (not under a separate `prompts/` directory). Reserved future plugins and skills are documented in §22 Extension Points. They must not be created as real manifests in v0.1a unless they have schema-backed tests.

## 9. Skill Map

### test-case-gen

Input: Lanhu PRD, markdown PRD, text, optional supplements.

Output artifacts (all under `projects/{project}/features/{feature}/`):

- `requirement/clarifications/clarification-dossier.json`
- `requirement/clarifications/confirmation-draft.md` ← rendered from dossier, no new facts
- `requirement/confirmed/confirmation-result.json`
- `requirement/spec/requirement-spec.json`
- `requirement/spec/requirement-spec.md` ← rendered from JSON
- `test-spec/test-points.json`
- `test-spec/test-spec.json`
- `test-spec/test-spec.md` ← rendered from JSON
- `exports/xmind/test-spec.xmind`
- `reports/design-report.md`
- `traces/{runId}.jsonl`
- `KnowledgeSuggestion[]` → Knowledge Repository

Responsibilities:

- normalize requirement source
- consult existing Knowledge
- identify requirement gaps
- bundle clarifications into a `ClarificationDossier`
- render `ConfirmationDraft` for human delivery
- import `ConfirmationResult`
- author `RequirementSpec`
- design test points
- author `TestSpec` with assertion layers L1–L5
- review TestSpec against RequirementSpec
- export XMind
- propose knowledge from confirmed decisions

Not responsible for:

- automation scripts
- bug submission
- Playwright execution
- writing knowledge directly (only suggests)

### knowledge-keeper

Input: `KnowledgeSuggestion`, manual updates, queries.

Output: knowledge records and search results.

In v0.1a `knowledge-keeper` is `interface-only` — its workflow file is reserved but not yet implemented. The schema dangling-reference test must skip workflow checks for `interface-only` skills.

### Reserved Skills

These are reserved but not real manifests in v0.1a:

- `hotfix-case-gen` — issue + Source Repo → focused regression TestSpec
- `ui-script-gen` — TestSpec → Playwright scripts
- `report-gen` — bug / conflict / failure reports
- `static-scan` — diff + Source Repo → reproducible RiskPoints
- `xmind-editor` — bidirectional XMind ↔ TestSpec sync (only if product demand confirmed)

## 10. Workflow Engine Design

### 10.1 Node types

v0.1a ships only the **core 5**:

- `tool` — Plugin Action invocation or Workflow Engine built-in tool action
- `agent` — Agent Runner invocation (LLM-backed, schema-validated output)
- `gate` — Quality gate, pure function over artifacts
- `human` — Suspended node, resumed by `confirmation import`
- `artifact` — Workspace provisioning or render-only conversion (no LLM)

Built-in tool actions in v0.1a:

- `knowledge.consult`
- `knowledge.propose`

These are dispatched by the Workflow Engine, not by Plugin Runtime. External plugins still register actions through plugin manifests. The built-in action IDs are exported by the Workflow Engine so workflow-reference tests and executors share one source of truth.

Reserved for v0.2 (only added when their semantics are needed):

- `branch`, `parallel`, `merge`, `knowledge`

In v0.1, `consult-knowledge` and `propose-knowledge` are implemented as `tool` nodes calling the Knowledge Repository — no `knowledge` node type yet.

### 10.2 Node states

```text
pending → ready → running → succeeded
                        ↘ failed (retryable | fatal)
                        ↘ waiting (resumable on input)
                        ↘ blocked (gate violation)
        ↘ skipped (unreachable after branch decision)
        ↘ cancelled (run cancelled)
```

Terminal set: `{succeeded, failed, blocked, skipped, cancelled}`. Workflow status is recomputed from the node table after every transition; it must never be set independently of the nodes.

### 10.3 Workflow states

```text
created
running
waiting
succeeded
failed
blocked
cancelled
```

Every node writes trace. Every completed artifact is indexed in `artifact-index.json`.

### 10.4 Resume rules

- `succeeded` nodes never rerun.
- `failed` retryable nodes rerun when their inputs are unchanged (verified via artifact hash).
- `failed` fatal nodes block the run; the user must intervene (edit input, change rules, etc.).
- `waiting` nodes resume after the awaited input is imported.
- If an upstream artifact is missing or its hash does not match the recorded `ArtifactRef`, all downstream `succeeded` nodes are invalidated back to `pending` before resuming.

## 11. Human Confirmation

Human confirmation is a workflow node, not an informal chat interruption.

v0.1 canonical confirmation format is JSON. Markdown import is reserved.

v0.1 flow:

1. The `clarification-drafter` agent produces `ClarificationDossier`.
2. An `artifact` node renders `confirmation-draft.md` from the dossier (no new facts).
3. The Workflow Engine writes `.state/{runId}.json` and transitions the human node to `waiting`.
4. The user sends `confirmation-draft.md` to product manually.
5. The user imports `confirmation-result.json` via `kata-agent confirmation import`.
6. The Workflow Engine validates the file against `ConfirmationResult` schema and writes it through the Artifact Repository to `requirement/confirmed/confirmation-result.json`.
7. On `rejected` answers for P0 gaps, the run goes to `blocked` with a `clarification-rebuttal.md` report; the user must edit the dossier and rerun the human node. Auto-loop is not provided in v0.1.
8. Otherwise the human node transitions to `succeeded` and the workflow resumes.

Future DingTalk send-and-collect support connects to the same human node — DingTalk replaces only the manual delivery step (4), never the validation step (6).

## 12. Plugin System

Plugin directory:

```text
plugins/{plugin}/
├── plugin.yaml
├── README.md
├── src/
├── schemas/
├── examples/
└── tests/
```

### 12.1 Plugin types

Plugin type names use full words for clarity:

| Type                 | Allowed output schemas      | Replaces (old short name) |
| -------------------- | --------------------------- | ------------------------- |
| `requirement-source` | `*SourceBundle`             | `source-plugin`           |
| `artifact-export`    | `*Export`                   | `export-plugin`           |
| `automation`         | `RunRecord`, `EvidencePack` | `surface-plugin`          |
| `notification`       | `NotificationResult`        | `notify-plugin`           |
| `issue-tracker`      | `IssueSyncResult`           | `issue-plugin`            |
| `rule-source`        | `*RuleSet`                  | `rule-plugin`             |

Allowed schemas are enforced via an explicit registry mapping (not string-suffix matching), so renames cannot silently break the constraint.

### 12.2 Plugin manifest fields

`plugin.yaml` declares:

- Plugin Actions
- input / output schema names (looked up in `SCHEMA_REGISTRY`)
- required secrets
- network permission (`none | restricted | open`)
- allowed write scopes (mapped to `Artifact Repository` paths)
- per-action `sideEffects` (`network`, `writeArtifacts`, `external`)

### 12.3 Plugin boundary discipline

- A plugin must declare exactly one type.
- A plugin's actions must only output schemas listed in §12.1 for that type.
- Plugins do not branch flow, do not write Knowledge, and do not call other plugins. The Workflow Engine is the sole composer.

### 12.4 Lanhu plugin (v0.1c real)

Type: `requirement-source`. Stays thin:

- parse Lanhu URL
- fetch text + images using `LANHU_COOKIE`
- persist raw source files into `sources/lanhu/`
- output `RequirementSourceBundle` with hashed `RawSourceFile[]`

It does not run an MCP server, orchestrate workflow, analyze requirements, write Knowledge, send notifications, or write back to Lanhu.

### 12.5 XMind plugin (v0.1c real)

Type: `artifact-export`. Renders `TestSpec` → `.xmind` and emits `XMindExport`.

XMind is **not** a source of truth in v0.1; bidirectional editing is reserved for the optional `xmind-editor` skill.

## 13. Agent System

### 13.1 Prompt structure

Every prompt is Chinese, concise, role-bounded, colocated with `agent.yaml` as `prompt.md`, and uses exactly these top-level headings:

```text
# 角色
# 职责
# 输入
# 输出
# 工作步骤
# 边界
# 完成标准
```

### 13.2 First-stage agents

| Agent                   | Input schema                                                       | Output schema          | Purpose                                                     |
| ----------------------- | ------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| `source-normalizer`     | `RequirementSourceBundle`                                          | `RequirementDraft`     | 规整源材料：去重、补段标题、提炼候选事实                    |
| `requirement-analyst`   | `RequirementAnalysisInput`                                         | `RequirementGapReport` | 用 16 类缺口分类 + P0–P3 严重度标注空白点                   |
| `clarification-drafter` | `RequirementGapReport`                                             | `ClarificationDossier` | 整理提问、可选默认值、显式假设                              |
| `requirement-author`    | `RequirementAuthorInput`                                            | `RequirementSpec`      | 合并人确认结果、澄清卷宗、需求草稿、缺口报告，产出 `RequirementSpec` |
| `test-point-designer`   | `RequirementSpec`                                                  | `TestPointSet`         | 由确认后的需求设计测试点                                    |
| `test-spec-author`      | `TestSpecAuthorInput`                                              | `TestSpec`             | 编写覆盖断言层 L1–L5 的 `TestSpec`                          |
| `test-spec-reviewer`    | `TestSpecReviewerInput`                                            | `ReviewReport`         | 与需求一致性审查；输出 `ReviewReport` 供后续 gate/report 消费 |

`RequirementAnalysisInput`, `TestSpecAuthorInput`, and `TestSpecReviewerInput` are artifact-ref bundles. They keep agent manifests single-input while still preserving required context from upstream artifacts. `RequirementAnalysisInput` carries both `RequirementDraft` and `KnowledgeConsultResult`, so `consult-knowledge` is not a dead dependency. `test-spec-reviewer` is wired into the `test-case-gen` workflow **before** the gate node, so its `ReviewReport` is available to gates and the design report.

### 13.3 Agent invariants

- Output must validate against the declared output schema.
- Output must preserve traceability fields defined by its output schema. Schemas that make assumptions or leave unresolved work must expose those facts explicitly rather than hiding them in prose.
- Agents must not write files (only Artifact Repository writes).
- Agents must not call external systems (only Plugin Runtime makes side effects).
- Agents must not branch the workflow.
- Agents must not weaken test expectations to make a downstream check pass.

## 14. Artifact Repository

Feature layout:

```text
projects/{project}/features/{feature}/
├── feature.yaml                          # FeatureManifest
├── artifact-index.json                   # all ArtifactRefs for this feature
├── sources/
│   └── lanhu/
├── requirement/
│   ├── drafts/
│   │   └── requirement-draft.json
│   ├── clarifications/
│   │   ├── clarification-dossier.json
│   │   └── confirmation-draft.md
│   ├── confirmed/
│   │   └── confirmation-result.json
│   └── spec/
│       ├── requirement-spec.json         # source of truth
│       └── requirement-spec.md
├── test-spec/
│   ├── test-points.json
│   ├── test-spec.json                    # source of truth
│   ├── test-spec.md                      # rendered from JSON
│   └── review-report.json
├── exports/
│   └── xmind/
│       └── test-spec.xmind
├── reports/
│   ├── design-report.md
│   └── clarification-rebuttal.md         # only when human rejects P0 confirmation
├── traces/
│   └── {runId}.jsonl
├── .history/                             # auto-backups before overwrite (gitignored)
└── .state/                               # workflow run state (gitignored)
```

### 14.1 Single sources of truth

- `feature.yaml` is the only place to describe feature identity.
- `requirement-spec.json` is the canonical confirmed requirement.
- `test-spec.json` is the canonical test specification.
- All `*.md` artifacts are rendered from their `*.json` siblings.
- XMind is exported from `test-spec.json`.

### 14.2 Write scopes

The Artifact Repository enforces write scopes against `PluginPermissions.writeScopes` and `AgentManifest.outputSchema`:

| Scope label                     | Path glob                       |
| ------------------------------- | ------------------------------- |
| `feature.sources`               | `sources/**`                    |
| `feature.requirement.drafts`    | `requirement/drafts/**`         |
| `feature.requirement.clarif`    | `requirement/clarifications/**` |
| `feature.requirement.confirmed` | `requirement/confirmed/**`      |
| `feature.requirement.spec`      | `requirement/spec/**`           |
| `feature.test-spec`             | `test-spec/**`                  |
| `feature.exports`               | `exports/**`                    |
| `feature.reports`               | `reports/**`                    |

Write scope is enforced by the Artifact Repository at write time; an agent or plugin attempting to write outside its declared scopes raises a fatal `FORBIDDEN_WRITE_SCOPE` error.

## 15. Knowledge Repository

Knowledge is reusable across features and runs.

Suggested layout:

```text
projects/{project}/knowledge/
├── index.json
├── overview.md
├── terms.md
├── modules/
├── business-rules/
├── surfaces/
├── pitfalls/
└── decisions/
```

Product confirmation results are high-quality knowledge sources.

Knowledge `business-rules/` records product/business facts. Rule Store is separate and records hard constraints for agent writing, validation, and project conventions.

Knowledge loop:

```text
consult-knowledge
  -> analyze-requirement-gaps
  -> confirmation-result
  -> propose-knowledge
  -> knowledge-keeper review
```

## 16. Core Schemas

All v0.1 schemas live as `schemas/{kebab-name}.schema.json` and are exported as a single `SCHEMA_REGISTRY` constant from `@kata-agent/domain`. Manifests reference schemas by name; the registry is the only allowed source of truth.

### 16.1 Domain schemas (test-case-gen artifact spine)

- `ArtifactRef`
- `FeatureManifest`
- `TestCaseGenInput`
- `LanhuFetchInput`
- `RawSourceFile`
- `RequirementSourceBundle`
- `RequirementDraft`
- `KnowledgeConsultResult`
- `RequirementAnalysisInput`
- `RequirementGap`
- `RequirementGapReport`
- `ClarificationDossier` ← renamed from `ClarificationPack`
- `ConfirmationDraft` ← render-artifact reference (replaces vague `ProductConfirmation`)
- `ConfirmationResult`
- `RequirementAuthorInput`
- `RequirementSpec` ← renamed from `EnhancedRequirement`
- `TestPoint`
- `TestPointSet`
- `TestSpecAuthorInput`
- `TestSpecReviewerInput`
- `TestSpec`
- `ReviewReport`
- `XMindExport`
- `DesignReport`
- `KnowledgeSuggestion`

### 16.2 Runtime schemas

- `PluginManifest`
- `PluginActionManifest`
- `SkillManifest`
- `AgentManifest`
- `ProviderRequest`
- `ProviderResponse`
- `WorkflowDefinition`
- `WorkflowRunState`
- `TraceEvent`

### 16.3 Reserved schemas (defined when their owner Skill ships)

- `FlowSpec` — ui-script-gen
- `RunPlan` / `RunRecord` — automation execution
- `EvidencePack` — automation evidence (screenshots, network logs)
- `IssueDraft` — issue-tracker plugins
- `RiskPoint` / `InspectionReport` — static-scan
- `RuleSet` — rule-source plugins
- `SourceRepoRef` — read-only source-repo references

## 16.1 Rules And Source Repositories

v0.1 focuses on `test-case-gen`, but two old kata concepts must stay visible in the architecture:

- Rule Store: global and project-level hard constraints used when rendering prompts and validating artifacts.
- Source Repo: read-only source repository references for later `hotfix-case-gen`, `static-scan`, and implementation-aware test design.

These are not implemented in v0.1a. They are reserved as first-class concepts rather than hidden plugin details.

Rule precedence:

```text
run input > project rules > global rules > skill defaults
```

Non-negotiable project rules inherited from old kata:

- no hardcoded absolute paths
- no hardcoded credentials, cookies, tokens, or internal service URLs
- tests that create files must use temporary directories and clean them up
- generated automation must not weaken assertions to make tests pass

Source repos must be read-only from kata-agent. Future source-aware Skills receive `SourceRepoRef` values and never operate on raw absolute paths.

## 17. test-case-gen Workflow

Node IDs are semantic. The workflow YAML is the single source of truth; this spec lists the same IDs for review only.

| #   | Node ID                        | Type     | Calls                            | Output schema             |
| --- | ------------------------------ | -------- | -------------------------------- | ------------------------- |
| 1   | `create-feature-workspace`     | artifact | Artifact Repository              | (provisioning)            |
| 2   | `ingest-requirement-source`    | tool     | `lanhu.fetchRequirement` (v0.1c) | `RequirementSourceBundle` |
| 3   | `normalize-requirement-source` | agent    | `source-normalizer`              | `RequirementDraft`        |
| 4   | `consult-knowledge`            | tool     | `knowledge.consult`              | `KnowledgeConsultResult`  |
| 5   | `analyze-requirement-gaps`     | agent    | `requirement-analyst`            | `RequirementGapReport`    |
| 6   | `draft-clarification-dossier`  | agent    | `clarification-drafter`          | `ClarificationDossier`    |
| 7   | `render-confirmation-draft`    | artifact | (md render of dossier)           | `ConfirmationDraft`       |
| 8   | `await-confirmation-result`    | human    | `confirmation import`            | `ConfirmationResult`      |
| 9   | `author-requirement-spec`      | agent    | `requirement-author`             | `RequirementSpec`         |
| 10  | `design-test-points`           | agent    | `test-point-designer`            | `TestPointSet`            |
| 11  | `author-test-spec`             | agent    | `test-spec-author`               | `TestSpec`                |
| 12  | `review-test-spec`             | agent    | `test-spec-reviewer`             | `ReviewReport`            |
| 13  | `gate-readiness`               | gate     | v0.1a: G2 + G3 + G4 + G5         | (pass/block)              |
| 14  | `export-xmind`                 | tool     | `xmind.export`                   | `XMindExport`             |
| 15  | `propose-knowledge`            | tool     | `knowledge.propose`              | `KnowledgeSuggestion[]`   |
| 16  | `write-design-report`          | artifact | render of trace + gates          | `DesignReport`            |

Dependencies are linear except:

- `author-requirement-spec` depends on `normalize-requirement-source`, `analyze-requirement-gaps`, `draft-clarification-dossier`, and `await-confirmation-result`.
- `author-test-spec` depends on `design-test-points` and `author-requirement-spec`, because `TestSpecAuthorInput` carries both `TestPointSet` and `RequirementSpec`.
- `review-test-spec` depends on `author-test-spec` and `author-requirement-spec`, because `TestSpecReviewerInput` carries both `TestSpec` and `RequirementSpec`.
- `gate-readiness` depends on `analyze-requirement-gaps`, `await-confirmation-result`, `author-requirement-spec`, `author-test-spec`, and `review-test-spec`.
- `write-design-report` renders from the run trace, artifact index, and gate results after `propose-knowledge`.

G6 Artifact Consistency needs exported artifacts, so it is intentionally not part of pre-export `gate-readiness`. It is implemented as a post-export gate when real XMind export lands.

## 18. Requirement Gap Taxonomy

- `business-goal`
- `user-role`
- `entry-path`
- `page-structure`
- `ui-copy`
- `field-rule`
- `interaction-flow`
- `state-flow`
- `data-rule`
- `exception-rule`
- `permission-rule`
- `compatibility`
- `non-functional`
- `dependency`
- `conflict`
- `automation-blocker`

Severity:

- `P0 blocking`
- `P1 high-risk`
- `P2 defaultable`
- `P3 suggestion`

P0 cannot be silently defaulted.

## 19. Quality Gates

### G1 Source Integrity

Input: `RequirementSourceBundle`.

Rules:

- source title exists
- at least one text block or image exists
- raw source files are referenced

Failure action:

- `block` when no usable source content exists
- `warn` when optional assets fail

### G2 Evidence Binding

Input: `RequirementSpec`.

Rules:

- every P0/P1 `RequirementSpec.rules[]` item has `sourceType != unknown`
- every assumed P1 rule has an explicit `assumption` record
- every confirmed rule references a `ConfirmationResult.answers[].questionId`
- every `openItems[].status` is one of the closed enum: `unconfirmed | confirmed | assumed | deferred`

Failure action:

- `block` for any P0 with `sourceType=unknown` or `openItems[].status="unconfirmed"`
- `warn` for any P1 with `status="assumed"`

### G3 Requirement Clarity

Input: `RequirementGapReport`, `ConfirmationResult`.

Rules:

- P0 gaps are confirmed or blocked
- P1 gaps are confirmed, explicitly assumed, or listed in open items

Failure action:

- `block` for unresolved P0
- `warn` for unresolved P1 with explicit assumption

### G4 TestSpec Validity

Input: `TestSpec`.

Rules:

- each case has requirementRefs
- each P0/P1 case has at least one assertion
- no case uses empty expectations such as "验证功能正常"
- duplicate cases by normalized steps and assertions are rejected

Failure action:

- `repair` for format issues
- `block` for missing assertions

### G5 Automation Readiness

Input: `TestSpec`, `RequirementSpec`.

Rules:

- every P0/P1 ready case has entry, action target, expected result, assertion, and UI contract reference
- blocked readiness includes blocker reason

Failure action:

- `block` for false ready state
- `warn` for partial readiness

### G6 Artifact Consistency

Input: `RequirementSpec`, `TestSpec`, XMind export result.

Rules:

- Markdown artifacts render from JSON facts
- XMind case count matches TestSpec case count
- artifact hashes match index

Failure action:

- `repair` for stale rendered views
- `block` for source-of-truth mismatch

## 20. Error Classification

`KataAgentErrorCode` is a closed enum exported from `@kata-agent/core`. Every error carries a `retryable: boolean` derived from this table.

| Code                          | Retryable | Source                       |
| ----------------------------- | --------- | ---------------------------- |
| `INVALID_MODEL_JSON`          | yes       | Agent Runner                 |
| `SCHEMA_VALIDATION_FAILED`    | yes       | Agent Runner / Artifact Repo |
| `PROVIDER_TRANSIENT`          | yes       | Provider Adapter             |
| `PLUGIN_NETWORK_TRANSIENT`    | yes       | Plugin handler               |
| `MISSING_SECRET`              | no        | Config Loader                |
| `FORBIDDEN_WRITE_SCOPE`       | no        | Artifact Repo                |
| `UNRESOLVED_P0_GAP`           | no        | Gate G3                      |
| `INVALID_WORKFLOW_DEFINITION` | no        | Workflow Engine              |
| `SCHEMA_REFERENCE_NOT_FOUND`  | no        | Domain registry              |
| `ARTIFACT_HASH_MISMATCH`      | no        | Artifact Repo                |
| `RUN_CANCELLED`               | no        | CLI / user                   |

## 21. Decisions For v0.1

| Question                      | v0.1 Decision                                                                     | Reason                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| requirement-only mode?        | no                                                                                | full mode keeps v0.1 smaller                                                   |
| confirmation import format?   | JSON canonical                                                                    | Markdown parsing can come later                                                |
| XMind in `test-case-gen`?     | yes                                                                               | first demo must produce XMind                                                  |
| auto-write product decisions? | no                                                                                | emit `KnowledgeSuggestion`; require `knowledge-keeper` acceptance              |
| package manager?              | Bun (≥1.2)                                                                        | text-based `bun.lock` only; pin via `engines.bun` in `package.json`            |
| schema source of truth        | `SCHEMA_REGISTRY` constant                                                        | manifests reference schema names; tests read the registry, no hand-typed lists |
| run id generation             | caller-provided in v0.1a; `crypto.randomUUID()` from v0.1b on `SkillRunner.start` | testability first                                                              |

## 22. Extension Points

Reserved but not implemented in v0.1:

- DingTalk confirmation send and reply collection
- Zentao bug creation and status sync
- mobile automation
- desktop automation
- API automation as a full surface
- static-scan risk injection into test-case-gen
- Codex / Claude / OpenAI / Hermes provider adapters
- macOS desktop console reusing `WorkflowController`
