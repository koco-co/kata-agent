# kata-agent v0.1c Real Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v0.1b mocked runtime edges with real provider, real Lanhu source capture, and real XMind export while keeping the Workflow Engine as the only flow controller.

**Architecture:** Keep v0.1b's WorkflowExecutor, Artifact Repository, gate functions, and human confirmation import. Add config/secrets loading, provider adapter registration, real plugin action handlers, and an e2e demo path that can run with either real credentials or deterministic local fixtures. Real external effects must be declared by plugin manifests and routed through Plugin Runtime / Artifact Repository.

**Tech Stack:** TypeScript, Bun, Ajv, YAML, file-backed artifacts, `fetch`, zip-based XMind export, provider adapters with OpenAI-compatible HTTP shape as the first concrete implementation.

---

## File Structure

- `packages/core/src/config-loader.ts` — `.env` and project config loader with no hardcoded secrets.
- `packages/agent-runner/src/openai-compatible-provider.ts` — real HTTP provider adapter using runtime config.
- `plugins/lanhu/src/real.ts` — real Lanhu source capture action.
- `plugins/xmind/src/exporter.ts` — real `.xmind` zip exporter from `TestSpec`.
- `packages/workflow-engine/src/runtime-factory.ts` — shared runtime assembly for CLI/demo.
- `apps/cli/src/index.ts` — flags to select mock vs real actions/providers.
- `tests/provider-adapter.test.ts` — provider request/response tests with mocked `fetch`.
- `tests/lanhu-plugin.test.ts` — local fixture-backed Lanhu parsing/capture tests.
- `tests/xmind-export.test.ts` — verifies `.xmind` is a zip and case count matches.
- `tests/real-demo-contract.test.ts` — real-demo command contract without external network.

## Task 0: v0.1b Runtime Hardening

**Files:**

- Modify: `packages/agent-runner/src/agent-runner.ts`
- Modify: `packages/workflow-engine/src/gates.ts`
- Modify: `packages/workflow-engine/src/executor.ts`
- Modify: `plugins/xmind/src/mock.ts`
- Test: `tests/agent-runner.runtime.test.ts`
- Test: `tests/quality-gates.test.ts`
- Test: `tests/runtime-loop.test.ts`

- [ ] **Step 1: Validate agent output inside AgentRunner**

Update `AgentRunner` to receive a validator function:

```ts
import type { SchemaName } from "../../domain/src/index";
import { assertValidSchema } from "../../domain/src/index";
import type { AgentManifest, AgentResponse } from "./agent";
import type { ProviderRegistry } from "./provider-registry";

export class AgentRunner {
  constructor(private readonly providers: ProviderRegistry) {}

  async run(
    agent: AgentManifest,
    input: unknown,
    prompt = "",
  ): Promise<AgentResponse> {
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
    let output: unknown;
    try {
      output = JSON.parse(response.content);
    } catch {
      throw new Error(`INVALID_MODEL_JSON ${agent.name}`);
    }
    assertValidSchema(agent.outputSchema as SchemaName, output);
    return { output, providerId: provider.id, usage: response.usage };
  }
}
```

- [ ] **Step 2: Add invalid output test**

Extend `tests/agent-runner.runtime.test.ts`:

```ts
test("rejects provider JSON that does not match agent output schema", async () => {
  const registry = new ProviderRegistry();
  registry.register(new MockProvider({ "source-normalizer": "{\"schemaVersion\":\"0.1\"}" }));
  const runner = new AgentRunner(registry);
  await expect(
    runner.run(
      {
        name: "source-normalizer",
        title: "source",
        version: "0.1.0",
        inputSchema: "RequirementSourceBundle",
        outputSchema: "RequirementDraft",
        ownerSkill: "test-case-gen",
        promptPath: "prompt.md",
      },
      {},
    ),
  ).rejects.toThrow("SCHEMA_VALIDATION_FAILED RequirementDraft");
});
```

- [ ] **Step 3: Fix P0 assumption gate semantics**

Change `checkRequirementClarity` so P0 is resolved only by `confirmed` answers:

```ts
const confirmed = new Set(
  confirmation.answers
    .filter((answer) => answer.status === "confirmed")
    .map((answer) => answer.questionId),
);
const violations = gaps.gaps
  .filter((gap) => gap.severity === "P0" && !confirmed.has(gap.id))
  .map((gap) => ({
    id: gap.id,
    severity: "error" as const,
    message: `Unresolved P0 gap: ${gap.question}`,
  }));
```

Add a test where a P0 gap answered with `assumed` still blocks.

- [ ] **Step 4: Separate mock `.xmind` file from `XMindExport` JSON**

Keep `mockExportXMind` returning:

```ts
{
  schemaVersion: "0.1",
  outputPath: "exports/xmind/test-spec.xmind",
  caseCount
}
```

Update `WorkflowExecutor` so `export-xmind` writes:

- `exports/xmind/xmind-export.json` as schema `XMindExport`
- `exports/xmind/test-spec.xmind` as a mock file artifact

The mock `.xmind` content can be:

```ts
`mock xmind export: ${output.caseCount} cases\n`
```

- [ ] **Step 5: Verify hardening**

Run: `bun test tests/agent-runner.runtime.test.ts tests/quality-gates.test.ts tests/runtime-loop.test.ts`

Expected: PASS.

## Task 1: Config Loader And Secret Boundary

**Files:**

- Create: `packages/core/src/config-loader.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/config-loader.test.ts`

- [ ] **Step 1: Implement local config loader**

`packages/core/src/config-loader.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { ConfigLoader } from "./config";

export interface LocalConfigLoaderOptions {
  rootDir: string;
  env?: Record<string, string | undefined>;
}

export class LocalConfigLoader implements ConfigLoader {
  constructor(private readonly options: LocalConfigLoaderOptions) {}

  loadEnv(): Record<string, string> {
    const file = join(this.options.rootDir, ".env");
    const values: Record<string, string> = {};
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index <= 0) continue;
        values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
      }
    }
    for (const [key, value] of Object.entries(this.options.env ?? process.env)) {
      if (typeof value === "string") values[key] = value;
    }
    return values;
  }

  resolveSecret(name: string): string | undefined {
    return this.loadEnv()[name];
  }

  loadProjectConfig(project: string): unknown {
    const file = join(this.options.rootDir, "projects", project, "project.yaml");
    if (!existsSync(file)) return {};
    return YAML.parse(readFileSync(file, "utf8"));
  }
}
```

- [ ] **Step 2: Export config loader**

Add to `packages/core/src/index.ts`:

```ts
export { LocalConfigLoader, type LocalConfigLoaderOptions } from "./config-loader";
```

- [ ] **Step 3: Test secret loading without hardcoding values**

`tests/config-loader.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { LocalConfigLoader } from "../packages/core/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("LocalConfigLoader", () => {
  test("loads .env and lets explicit env override it", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    writeFileSync(join(rootDir, ".env"), "LANHU_COOKIE=file-cookie\n");
    const loader = new LocalConfigLoader({
      rootDir,
      env: { LANHU_COOKIE: "env-cookie" },
    });
    expect(loader.resolveSecret("LANHU_COOKIE")).toBe("env-cookie");
  });
});
```

- [ ] **Step 4: Verify config loader**

Run: `bun test tests/config-loader.test.ts`

Expected: PASS.

## Task 2: OpenAI-Compatible Provider Adapter

**Files:**

- Create: `packages/agent-runner/src/openai-compatible-provider.ts`
- Modify: `packages/agent-runner/src/index.ts`
- Create: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Implement provider adapter**

`packages/agent-runner/src/openai-compatible-provider.ts`:

```ts
import type { JsonValue } from "../../core/src/index";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./provider";

export interface OpenAICompatibleProviderOptions {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id: string;
  readonly capabilities = {
    toolUse: false,
    structuredOutput: true,
    promptCaching: false,
    streaming: false,
    maxContextTokens: 128000,
  };

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        response_format:
          request.responseFormat === "json" || typeof request.responseFormat === "object"
            ? { type: "json_object" }
            : undefined,
      }),
    });
    if (!response.ok) throw new Error(`PROVIDER_TRANSIENT ${response.status}`);
    const json = (await response.json()) as JsonValue & {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("INVALID_MODEL_JSON missing content");
    return {
      content,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        durationMs: Date.now() - started,
      },
      raw: json,
    };
  }
}
```

- [ ] **Step 2: Export adapter**

Add to `packages/agent-runner/src/index.ts`:

```ts
export {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";
```

- [ ] **Step 3: Add provider tests with mocked fetch**

`tests/provider-adapter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { OpenAICompatibleProvider } from "../packages/agent-runner/src/index";

describe("OpenAICompatibleProvider", () => {
  test("posts chat completions request and returns content", async () => {
    const calls: RequestInit[] = [];
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://provider.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (_url, init) => {
        calls.push(init ?? {});
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "{\"ok\":true}" } }],
            usage: { prompt_tokens: 3, completion_tokens: 4 },
          }),
          { status: 200 },
        );
      },
    });
    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      responseFormat: "json",
      metadata: { agent: "test" },
    });
    expect(response.content).toBe("{\"ok\":true}");
    expect(response.usage.inputTokens).toBe(3);
    expect(JSON.stringify(calls[0]?.headers)).not.toContain("LANHU_COOKIE");
  });
});
```

- [ ] **Step 4: Verify provider adapter**

Run: `bun test tests/provider-adapter.test.ts`

Expected: PASS.

## Task 3: Real Lanhu Source Capture

**Files:**

- Create: `plugins/lanhu/src/real.ts`
- Modify: `plugins/lanhu/src/mock.ts`
- Create: `tests/lanhu-plugin.test.ts`

- [ ] **Step 1: Implement HTML/text capture action**

`plugins/lanhu/src/real.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LanhuFetchInput, RequirementSourceBundle } from "../../../packages/domain/src/index";

export interface LanhuFetchContext {
  rootDir: string;
  project: string;
  feature: string;
  cookie?: string;
  fetchImpl?: typeof fetch;
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchLanhuRequirement(
  input: LanhuFetchInput,
  context: LanhuFetchContext,
): Promise<RequirementSourceBundle> {
  const fetchImpl = context.fetchImpl ?? fetch;
  const response = await fetchImpl(input.url, {
    headers: context.cookie ? { cookie: context.cookie } : {},
  });
  if (!response.ok) throw new Error(`PLUGIN_NETWORK_TRANSIENT ${response.status}`);
  const html = await response.text();
  const text = stripHtml(html);
  const sourceDir = join(
    context.rootDir,
    "projects",
    context.project,
    "features",
    context.feature,
    "sources",
    "lanhu",
  );
  mkdirSync(sourceDir, { recursive: true });
  const rawPath = join(sourceDir, "raw.html");
  writeFileSync(rawPath, html);
  return {
    schemaVersion: "0.1",
    sourceType: "lanhu",
    sourceUrl: input.url,
    title: text.slice(0, 80) || "Lanhu Requirement",
    textBlocks: [{ id: "SRC-001", title: "Lanhu HTML Text", content: text }],
    images: [],
    rawFiles: [
      {
        id: "RAW-HTML",
        path: "sources/lanhu/raw.html",
        mediaType: "text/html",
        hash: sha256(html),
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Add fixture-backed test**

`tests/lanhu-plugin.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { fetchLanhuRequirement } from "../plugins/lanhu/src/real";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Lanhu real source capture", () => {
  test("captures html source without exposing cookie", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const output = await fetchLanhuRequirement(
      { url: "https://lanhu.example/prd", outputDir: "sources/lanhu" },
      {
        rootDir,
        project: "demo",
        feature: "rule-config",
        cookie: "secret-cookie",
        fetchImpl: async (_url, init) => {
          expect(JSON.stringify(init)).toContain("secret-cookie");
          return new Response("<html><body><h1>规则配置</h1><p>保存按钮</p></body></html>");
        },
      },
    );
    expect(output.textBlocks[0]?.content).toContain("规则配置");
    expect(JSON.stringify(output)).not.toContain("secret-cookie");
    expect(
      existsSync(join(rootDir, "projects", "demo", "features", "rule-config", "sources", "lanhu", "raw.html")),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Verify Lanhu plugin**

Run: `bun test tests/lanhu-plugin.test.ts`

Expected: PASS.

## Task 4: Real XMind Export

**Files:**

- Modify: `package.json`
- Create: `plugins/xmind/src/exporter.ts`
- Create: `tests/xmind-export.test.ts`

- [ ] **Step 1: Add zip dependency**

Run: `bun add jszip`

Expected: `package.json` and `bun.lock` update.

- [ ] **Step 2: Implement `.xmind` zip exporter**

`plugins/xmind/src/exporter.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import type { TestSpec, XMindExport } from "../../../packages/domain/src/index";

export async function exportXMindFile(
  input: TestSpec,
  featureDir: string,
): Promise<XMindExport> {
  const caseCount = input.modules.reduce((total, module) => total + module.cases.length, 0);
  const rootTopic = {
    id: "root",
    title: input.title,
    children: {
      attached: input.modules.map((module) => ({
        id: module.id,
        title: module.name,
        children: {
          attached: module.cases.map((testCase) => ({
            id: testCase.id,
            title: `${testCase.priority} ${testCase.title}`,
            children: {
              attached: testCase.assertions.map((assertion) => ({
                id: assertion.id,
                title: `${assertion.layer} ${assertion.target}: ${assertion.expected}`,
              })),
            },
          })),
        },
      })),
    },
  };
  const zip = new JSZip();
  zip.file(
    "content.json",
    JSON.stringify([{ id: "sheet-1", title: input.title, rootTopic }], null, 2),
  );
  zip.file("metadata.json", JSON.stringify({ creator: "kata-agent", version: "0.1" }, null, 2));
  zip.file("manifest.json", JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {} } }, null, 2));
  const outputPath = "exports/xmind/test-spec.xmind";
  const fullPath = join(featureDir, outputPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, Buffer.from(await zip.generateAsync({ type: "uint8array" })));
  return { schemaVersion: "0.1", outputPath, caseCount };
}
```

- [ ] **Step 3: Verify XMind export**

Run: `bun test tests/xmind-export.test.ts`

Expected: PASS and the test opens the zip with JSZip and asserts `content.json` contains the test case title.

## Task 5: Runtime Factory With Mock/Real Selection

**Files:**

- Create: `packages/workflow-engine/src/runtime-factory.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Modify: `apps/cli/src/index.ts`
- Test: `tests/runtime-factory.test.ts`

- [ ] **Step 1: Extract CLI runtime assembly**

Move `createRuntimeServices` out of `apps/cli/src/index.ts` into `packages/workflow-engine/src/runtime-factory.ts`.

Create `packages/workflow-engine/src/runtime-factory.ts` with this public shape and implementation skeleton:

```ts
import { AgentRunner, MockProvider, OpenAICompatibleProvider, ProviderRegistry } from "../../agent-runner/src/index";
import { LocalConfigLoader } from "../../core/src/index";
import type { LanhuFetchInput, RequirementDraft, RequirementSpec, TestSpec } from "../../domain/src/index";
import { consultKnowledge, proposeKnowledge } from "../../knowledge-repo/src/index";
import { PluginActionRegistry } from "../../plugin-runtime/src/index";
import { mockFetchRequirement } from "../../../plugins/lanhu/src/mock";
import { fetchLanhuRequirement } from "../../../plugins/lanhu/src/real";
import { mockExportXMind } from "../../../plugins/xmind/src/mock";
import { exportXMindFile } from "../../../plugins/xmind/src/exporter";
import { WorkflowExecutor } from "./executor";

export interface RuntimeFactoryOptions {
  rootDir: string;
  mode: "mock" | "real";
}

export function createRuntimeServices(options: RuntimeFactoryOptions): {
  executor: WorkflowExecutor;
} {
  const providers = new ProviderRegistry();
  const actions = new PluginActionRegistry();
  const config = new LocalConfigLoader({ rootDir: options.rootDir });

  if (options.mode === "real") {
    const baseUrl = config.resolveSecret("KATA_AGENT_PROVIDER_BASE_URL");
    const apiKey = config.resolveSecret("KATA_AGENT_PROVIDER_API_KEY");
    const model = config.resolveSecret("KATA_AGENT_PROVIDER_MODEL");
    if (!baseUrl || !apiKey || !model) throw new Error("MISSING_SECRET provider config");
    providers.register(
      new OpenAICompatibleProvider({
        id: "openai-compatible",
        baseUrl,
        apiKey,
        model,
      }),
    );
    actions.register("lanhu.fetchRequirement", (input, context) =>
      fetchLanhuRequirement(input as LanhuFetchInput, {
        ...context,
        cookie: config.resolveSecret("LANHU_COOKIE"),
      }),
    );
    actions.register("xmind.export", async (input, context) =>
      exportXMindFile(
        input as TestSpec,
        `${context.rootDir}/projects/${context.project}/features/${context.feature}`,
      ),
    );
  } else {
    providers.register(new MockProvider(createMockAgentResponses()));
    actions.register("lanhu.fetchRequirement", (input) =>
      mockFetchRequirement(input as LanhuFetchInput),
    );
    actions.register("xmind.export", (input) => mockExportXMind(input as TestSpec));
  }

  actions.register("knowledge.consult", (input) =>
    consultKnowledge(input as RequirementDraft),
  );
  actions.register("knowledge.propose", (input, context) =>
    proposeKnowledge(input as RequirementSpec, context.rootDir),
  );

  return {
    executor: new WorkflowExecutor({
      agentRunner: new AgentRunner(providers),
      actions,
      agents: createAgentManifestMap(),
    }),
  };
}
```

Move the existing CLI mock provider response map into a local `createMockAgentResponses()` helper, and move the existing agent manifest map into `createAgentManifestMap()`.

- [ ] **Step 2: Update CLI flags**

Add:

```bash
--mode mock
--mode real
```

Default to `mock`.

- [ ] **Step 3: Verify runtime factory**

Run: `bun test tests/runtime-factory.test.ts`

Expected: PASS, including a test that real mode fails with `MISSING_SECRET` when provider config is absent.

## Task 6: Real Demo Contract Test

**Files:**

- Create: `tests/real-demo-contract.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add contract test without external network**

The test must run:

```bash
bun apps/cli/src/index.ts test-case-gen --mode real --project demo --feature rule-config --source-url https://lanhu.example/prd --root <tmp>
```

Use injected/mocked `fetch` where needed; do not call the real internet in tests.

Assert:

- source raw HTML exists
- confirmation draft exists
- after confirmation import/resume, `.xmind` zip exists
- `requirement-spec.json`, `test-spec.json`, trace, and design report exist

- [ ] **Step 2: Document real demo usage**

Add a README section:

````md
## v0.1c Real Demo

Required environment:

- KATA_AGENT_PROVIDER_BASE_URL
- KATA_AGENT_PROVIDER_API_KEY
- KATA_AGENT_PROVIDER_MODEL
- LANHU_COOKIE, only when the Lanhu URL requires authentication

Run:

```bash
bun apps/cli/src/index.ts test-case-gen --mode real --project <project> --feature <feature> --source-url <lanhu-url> --root .
```
````

Do not include real cookies, tokens, or internal URLs in the README.

- [ ] **Step 3: Verify real demo contract**

Run: `bun test tests/real-demo-contract.test.ts`

Expected: PASS.

## Task 7: Full Verification

**Files:**

- Modify only files required by earlier tasks.

- [ ] **Step 1: Run tests**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 3: Secret/path scan**

Run:

```bash
rg -n "LANHU_COOKIE=|Bearer [A-Za-z0-9]|https://[^ ]*internal|/Users/|/private/" README.md apps packages plugins schemas tests workflows agents skills package.json bun.lock
```

Expected: no hardcoded secrets, internal URLs, or local absolute paths in checked source, tests, manifests, package metadata, or README.

- [ ] **Step 4: Commit**

```bash
git add apps packages plugins schemas tests README.md bun.lock package.json docs/superpowers/plans/2026-05-01-kata-agent-v0.1c-real-providers.md
git commit -m "feat: add real provider and export demo path"
```

## Self-Review

Spec coverage:

- v0.1c replaces mocked edges with real provider adapter, real Lanhu source capture, and real XMind export.
- Workflow Engine remains the only flow controller.
- Real external effects are plugin/provider boundaries, not agent behavior.
- Tests do not depend on external network or real credentials.

Known boundaries:

- Lanhu parsing is intentionally thin: capture text/raw source first, refine DOM/image extraction after observing real pages.
- Provider adapter starts with OpenAI-compatible chat completions; additional providers can be added behind `ProviderAdapter`.
- Real XMind export focuses on inspectable case hierarchy, not bidirectional XMind edit/reverse sync.
