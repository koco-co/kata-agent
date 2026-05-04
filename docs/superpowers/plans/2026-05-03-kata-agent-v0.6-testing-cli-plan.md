# kata-agent v0.6 Testing CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 kata-agent 的自然语言 Chat CLI 升级为测试领域助手，新增测试身份、测试工具 facade、测试意图提示、workspace 感知和测试专用 slash commands，同时保持 v0.5 的会话、权限、工具运行时、输出截断和模型调用循环兼容。

**Architecture:** 在 `packages/conversation-agent/src/testing/*` 增加测试领域层，复用现有 `ConversationAgent` 构造函数、`ToolRuntime.register()`、`SessionStore` 和 `buildSystemPrompt()`。工具仍由 CLI 启动点 `apps/cli/src/chat.ts` 注册到 agent；测试工具实现 `ConversationTool`，通过单一 `actionId` bridge 调用已有 plugin/skill/session 能力，不使用拆分的 plugin-name/command-name tuple。`IntentBias` 在现有 `packages/conversation-agent/src/intent.ts` 类内扩展测试关键词，不新建平行 intent 类。

**Tech Stack:** Bun, TypeScript, existing `@kata-agent/conversation-agent`, existing `PluginActionRegistry` action IDs, existing skill workflows (`test-case-gen`, `ui-script-gen`), existing plugin action IDs (`playwright.runPlan`, `staticScan.scanDiff`, `xmind.export`, `report.generateHtmlReport`, `report.generateAllureReport`, `zentao.syncIssue`, `lanhu.fetchRequirement`), no new runtime dependencies.

---

## Compatibility Corrections From Review

- All conversation-agent paths use `packages/conversation-agent/src/...`; CLI paths use `apps/cli/src/...`.
- There is no root-level `src` module tree in this plan.
- `TestingToolDefinition` extends `ConversationTool`, so every test tool includes `permission` and `toolset`.
- All tool execution results use `ToolResult.summary`; do not add or rely on a second textual result field.
- Test tools are registered in `apps/cli/src/chat.ts` with `agent.registerTool(tool)`.
- `IntentBias` is extended in `packages/conversation-agent/src/intent.ts`; do not create a separate testing intent class.
- `SlashCommand` and `ALL_SLASH_COMMANDS` are closed in `packages/conversation-agent/src/types.ts`; add every new command there.
- Plugin/skill/session routing uses one `actionId` string such as `playwright.runPlan` or `skill.test-case-gen`; do not model plugin calls as a split plugin-name/command-name tuple.

## Current v0.5 Interfaces To Preserve

- `ConversationAgent` constructor: `new ConversationAgent(config: AgentConfig)`.
- `AgentConfig`: currently includes `sessionDir`, `workspaceRoot`, `model`, `provider`, `apiKey`, optional `apiBase`, `maxIterations`, `stream`.
- `ConversationTool`: `{ name, description, inputSchema, permission, toolset, execute(input, context) }`.
- `ToolResult`: `{ ok, summary, data?, error? }`.
- `ToolsetName`: `"qa-workflows" | "files" | "shell" | "artifacts" | "knowledge" | "external-plugins" | "approvals"`.
- `SlashCommand`: closed union plus `ALL_SLASH_COMMANDS` runtime list.
- `ToolRuntime.register(tool)` stores by name; `ToolRuntime.execute(name, input, context)` enforces `permission`.
- `SessionStore` persists JSONL messages and metadata; do not change its file format for v0.6.
- `buildSystemPrompt(tools, enabledToolsets, intentContext?)` filters tools by `toolset` and lists permission levels.
- `apps/cli/src/chat.ts` creates `ConversationAgent`, registers all tools, prints the banner, and forwards slash commands to `agent.handleSlashCommand()`.

## File Structure

**Create:**

- `packages/conversation-agent/src/testing/workspace.ts` - read-only kata workspace discovery for banner, prompt, and `/features`.
- `packages/conversation-agent/src/testing/system-prompt.ts` - testing identity and workspace prompt block used by `prompts.ts`.
- `packages/conversation-agent/src/testing/tools.ts` - `TestingToolDefinition`, `TestingActionBridge`, actionId routing, and seven `test.*` tools.
- `packages/conversation-agent/src/testing/slash-commands.ts` - test slash command parser/handler used by `ConversationAgent.handleSlashCommand()`.
- `packages/conversation-agent/src/testing/index.ts` - testing domain exports.
- `apps/cli/src/chat-testing-actions.ts` - CLI-owned bridge from test tools to action IDs; `apps/cli/src/chat.ts` remains the registration point.
- `tests/conversation-agent/testing-workspace.test.ts`
- `tests/conversation-agent/testing-tools.test.ts`
- `tests/conversation-agent/testing-slash-commands.test.ts`

**Modify:**

- `packages/conversation-agent/src/types.ts` - extend `SlashCommand` and `ALL_SLASH_COMMANDS`.
- `packages/conversation-agent/src/intent.ts` - extend the existing `IntentBias` class.
- `packages/conversation-agent/src/prompts.ts` - include testing prompt block without breaking existing signature callers.
- `packages/conversation-agent/src/agent.ts` - pass testing workspace to prompt and delegate testing slash commands.
- `packages/conversation-agent/src/index.ts` - export testing helpers.
- `apps/cli/src/chat.ts` - discover workspace, pass it into agent config, and register `createTestingTools(...)`.
- `tests/conversation-agent/types.test.ts`
- `tests/conversation-agent/intent.test.ts`
- `tests/conversation-agent/agent.test.ts`
- `tests/conversation-agent/chat-cli.test.ts`

## Action ID Routing Contract

| Test tool | Default action IDs | Notes |
| --- | --- | --- |
| `test.run` | `playwright.runPlan`, optional `playwright.runPlan.real` | Use `playwright.runPlan.real` only when input explicitly requests real mode. |
| `test.gen_cases` | `skill.test-case-gen`, `skill.ui-script-gen` | `format: "playwright-script"` routes to `skill.ui-script-gen`; default routes to `skill.test-case-gen`. |
| `test.scan` | `staticScan.scanDiff` | Static risk scan. |
| `test.report` | `report.generateHtmlReport`, `report.generateAllureReport`, optional `zentao.syncIssue` | Zentao sync only when explicitly requested. |
| `test.export_xmind` | `xmind.export` | Exports from a `TestSpec` payload or artifact reference. |
| `test.prepare_env` | `lanhu.fetchRequirement`, optional `knowledge.consult` | External/network work stays permission-gated. |
| `test.session` | `session.save`, `session.resume`, `session.summary`, `session.list` | Local session actions implemented by the bridge using existing `SessionStore`/metadata APIs. |

---

### Task 1: Workspace Discovery

**Goal:** Add read-only workspace summary data for the testing prompt, banner, and `/features`.

**Files:**

- Create: `packages/conversation-agent/src/testing/workspace.ts`
- Create: `tests/conversation-agent/testing-workspace.test.ts`
- Modify: `packages/conversation-agent/src/testing/index.ts`

- [ ] **Step 1: Write failing workspace tests**

Create `tests/conversation-agent/testing-workspace.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTestingWorkspace } from "../../packages/conversation-agent/src/testing/workspace";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kata-agent-testing-workspace-"));
  mkdirSync(join(root, "features"), { recursive: true });
  mkdirSync(join(root, "tests/e2e"), { recursive: true });
  mkdirSync(join(root, "test-cases"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "features/login.feature"), "Feature: login");
  writeFileSync(join(root, "tests/e2e/login.spec.ts"), "test('login', () => {})");
  writeFileSync(join(root, "test-cases/login.md"), "# login cases");
  writeFileSync(join(root, "reports/login.html"), "<html></html>");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "kata-demo" }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("discoverTestingWorkspace", () => {
  test("counts testing assets without creating files", () => {
    const summary = discoverTestingWorkspace(root);

    expect(summary).toEqual({
      root,
      name: "kata-demo",
      status: "ready",
      featureCount: 1,
      specCount: 1,
      caseAssetCount: 1,
      reportCount: 1,
      featureFiles: ["features/login.feature"],
    });
  });

  test("returns empty status for a directory without testing assets", () => {
    rmSync(join(root, "features"), { recursive: true, force: true });
    rmSync(join(root, "tests"), { recursive: true, force: true });
    rmSync(join(root, "test-cases"), { recursive: true, force: true });
    rmSync(join(root, "reports"), { recursive: true, force: true });

    const summary = discoverTestingWorkspace(root);

    expect(summary.status).toBe("empty");
    expect(summary.featureCount).toBe(0);
    expect(summary.specCount).toBe(0);
    expect(summary.caseAssetCount).toBe(0);
    expect(summary.reportCount).toBe(0);
    expect(summary.featureFiles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test tests/conversation-agent/testing-workspace.test.ts
```

Expected: fail with module not found for `packages/conversation-agent/src/testing/workspace`.

- [ ] **Step 3: Implement read-only discovery**

Create `packages/conversation-agent/src/testing/workspace.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export type TestingWorkspaceStatus = "ready" | "empty" | "unknown";

export interface TestingWorkspaceSummary {
  root: string;
  name: string;
  status: TestingWorkspaceStatus;
  featureCount: number;
  specCount: number;
  caseAssetCount: number;
  reportCount: number;
  featureFiles: string[];
}

function readWorkspaceName(root: string): string {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) return basename(root);

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
    return parsed.name?.trim() || basename(root);
  } catch {
    return basename(root);
  }
}

function walkFiles(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function countByExtension(files: string[], extensions: string[]): number {
  return files.filter((file) => extensions.some((ext) => file.endsWith(ext))).length;
}

export function discoverTestingWorkspace(root = process.cwd()): TestingWorkspaceSummary {
  const featureFiles = walkFiles(root, "features")
    .filter((file) => file.endsWith(".feature"))
    .map((file) => relative(root, join(root, file)));
  const testFiles = [...walkFiles(root, "tests"), ...walkFiles(root, "e2e")];
  const caseFiles = [...walkFiles(root, "test-cases"), ...walkFiles(root, "cases")];
  const reportFiles = [...walkFiles(root, "reports"), ...walkFiles(root, "artifacts")];

  const featureCount = featureFiles.length;
  const specCount = countByExtension(testFiles, [".spec.ts", ".test.ts"]);
  const caseAssetCount = countByExtension(caseFiles, [".md", ".xmind", ".json"]);
  const reportCount = countByExtension(reportFiles, [".html", ".json", ".md"]);
  const total = featureCount + specCount + caseAssetCount + reportCount;

  return {
    root,
    name: readWorkspaceName(root),
    status: total > 0 ? "ready" : "empty",
    featureCount,
    specCount,
    caseAssetCount,
    reportCount,
    featureFiles,
  };
}
```

- [ ] **Step 4: Export testing workspace module**

Create `packages/conversation-agent/src/testing/index.ts`:

```ts
export * from "./workspace";
```

- [ ] **Step 5: Pass workspace tests**

Run:

```bash
bun test tests/conversation-agent/testing-workspace.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/conversation-agent/src/testing/workspace.ts packages/conversation-agent/src/testing/index.ts tests/conversation-agent/testing-workspace.test.ts
git commit -m "feat: discover testing workspace summary"
```

---

### Task 2: Testing Prompt Integration

**Goal:** Add testing identity and workspace context through the existing `buildSystemPrompt()` path.

**Files:**

- Create: `packages/conversation-agent/src/testing/system-prompt.ts`
- Create: `tests/conversation-agent/testing-system-prompt.test.ts`
- Modify: `packages/conversation-agent/src/prompts.ts`
- Modify: `packages/conversation-agent/src/agent.ts`
- Modify: `packages/conversation-agent/src/index.ts`

- [ ] **Step 1: Write failing prompt tests**

Create `tests/conversation-agent/testing-system-prompt.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../../packages/conversation-agent/src/prompts";
import type { ConversationTool } from "../../packages/conversation-agent/src/types";

function makeTool(name: string): ConversationTool {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: "object" },
    permission: "safe",
    toolset: "qa-workflows",
    execute: async () => ({ ok: true, summary: "done" }),
  };
}

describe("testing system prompt", () => {
  test("adds testing identity while preserving tool listing", () => {
    const prompt = buildSystemPrompt(
      [makeTool("test.run"), makeTool("workflow_start")],
      ["qa-workflows"],
      "Detected: Workflow: test-run.",
      {
        testingWorkspace: {
          root: "/repo/kata-demo",
          name: "kata-demo",
          status: "ready",
          featureCount: 2,
          specCount: 3,
          caseAssetCount: 4,
          reportCount: 1,
          featureFiles: ["features/login.feature", "features/pay.feature"],
        },
      },
    );

    expect(prompt).toContain("测试领域 CLI 助手");
    expect(prompt).toContain("中文优先");
    expect(prompt).toContain("kata-demo");
    expect(prompt).toContain("Feature 数量：2");
    expect(prompt).toContain("test.run");
    expect(prompt).toContain("Permission: safe");
    expect(prompt).toContain("Detected: Workflow: test-run.");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test tests/conversation-agent/testing-system-prompt.test.ts
```

Expected: fail because `buildSystemPrompt()` does not accept testing workspace options.

- [ ] **Step 3: Add testing prompt block builder**

Create `packages/conversation-agent/src/testing/system-prompt.ts`:

```ts
import type { TestingWorkspaceSummary } from "./workspace";

export function buildTestingPromptBlock(workspace: TestingWorkspaceSummary): string {
  return [
    "## Testing CLI Identity",
    "",
    "你是 kata-agent，一个运行在终端中的测试领域 CLI 助手。",
    "中文优先回答；当用户使用英文或请求双语输出时，可以使用英文。",
    "",
    "测试工作流：需求理解 -> 用例设计 -> 脚本生成 -> 执行与回归 -> 缺陷与报告。",
    "优先使用 test.* 工具处理测试运行、用例生成、扫描、报告和导出。",
    "不要改变 kata workspace 结构；只在现有 feature/workspace 约定内读写。",
    "",
    "Workspace:",
    `- 名称：${workspace.name}`,
    `- 根目录：${workspace.root}`,
    `- 状态：${workspace.status}`,
    `- Feature 数量：${workspace.featureCount}`,
    `- Spec 数量：${workspace.specCount}`,
    `- 用例资产数量：${workspace.caseAssetCount}`,
    `- 报告数量：${workspace.reportCount}`,
  ].join("\n");
}
```

- [ ] **Step 4: Extend `buildSystemPrompt()` compatibly**

Modify `packages/conversation-agent/src/prompts.ts`:

```ts
import type { ConversationTool, ToolsetName } from "./types";
import type { TestingWorkspaceSummary } from "./testing/workspace";
import { buildTestingPromptBlock } from "./testing/system-prompt";

export interface SystemPromptOptions {
  testingWorkspace?: TestingWorkspaceSummary;
}

export function buildSystemPrompt(
  tools: ConversationTool[],
  enabledToolsets: ToolsetName[],
  intentContext?: string,
  options: SystemPromptOptions = {},
): string {
  const enabledSet = new Set(enabledToolsets);
  const filteredTools = tools.filter((t) => enabledSet.has(t.toolset));
  const lines: string[] = [];

  if (options.testingWorkspace) {
    lines.push(buildTestingPromptBlock(options.testingWorkspace));
  } else {
    lines.push("# You are an AI assistant for the kata-agent development platform.");
  }

  lines.push("");
  // Keep the existing Available Tools, Slash Commands, Tool Usage Rules, and Response Guidelines sections below.
}
```

Preserve the rest of the existing function body, especially tool filtering by `toolset`, permission listing, slash command docs, and tool usage rules.

- [ ] **Step 5: Pass testing prompt test and existing prompt tests**

Run:

```bash
bun test tests/conversation-agent/testing-system-prompt.test.ts tests/conversation-agent/agent.test.ts
```

Expected: pass after updating any assertions that intentionally check the generic identity.

- [ ] **Step 6: Wire prompt option through `ConversationAgent`**

Modify `packages/conversation-agent/src/agent.ts`:

```ts
import type { TestingWorkspaceSummary } from "./testing/workspace";

export interface AgentConfig {
  sessionDir: string;
  workspaceRoot: string;
  model: string;
  provider: string;
  apiKey: string;
  apiBase?: string;
  maxIterations?: number;
  stream?: boolean;
  testingWorkspace?: TestingWorkspaceSummary;
}
```

Then pass the option in both `handleSlashCommand("/help")` and `processUserMessage()`:

```ts
const prompt = buildSystemPrompt(
  this.runtime.listTools(),
  this.enabledToolsets,
  undefined,
  { testingWorkspace: this.config.testingWorkspace },
);
```

```ts
const systemPrompt = buildSystemPrompt(
  this.runtime.listTools(),
  this.enabledToolsets,
  intentContext,
  { testingWorkspace: this.config.testingWorkspace },
);
```

Do not change `new ConversationAgent(config)` call shape; only add an optional config field.

- [ ] **Step 7: Export testing helpers**

Modify `packages/conversation-agent/src/index.ts`:

```ts
export * from "./testing";
export type { SystemPromptOptions } from "./prompts";
```

- [ ] **Step 8: Commit**

```bash
git add packages/conversation-agent/src/testing/system-prompt.ts packages/conversation-agent/src/prompts.ts packages/conversation-agent/src/agent.ts packages/conversation-agent/src/index.ts tests/conversation-agent/testing-system-prompt.test.ts tests/conversation-agent/agent.test.ts
git commit -m "feat: add testing system prompt context"
```

---

### Task 3: Testing Tool Facade

**Goal:** Add seven `test.*` tools as valid `ConversationTool`s with `permission`, `toolset`, `ToolResult.summary`, and actionId-based routing.

**Files:**

- Create: `packages/conversation-agent/src/testing/tools.ts`
- Create: `tests/conversation-agent/testing-tools.test.ts`
- Modify: `packages/conversation-agent/src/testing/index.ts`

- [ ] **Step 1: Write failing tests for tool contracts and action IDs**

Create `tests/conversation-agent/testing-tools.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";
import {
  createTestingTools,
  type TestingActionBridge,
} from "../../packages/conversation-agent/src/testing/tools";

const ctx: ToolContext = {
  workspaceRoot: "/repo",
  sessionId: "session-1",
  yolo: true,
  env: {},
};

function createBridge(): { bridge: TestingActionBridge; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    bridge: {
      executeAction: async (actionId, input, context): Promise<ToolResult> => {
        calls.push(`${actionId}:${context.sessionId}:${JSON.stringify(input)}`);
        return { ok: true, summary: `executed ${actionId}`, data: { actionId } };
      },
    },
  };
}

describe("createTestingTools", () => {
  test("registers all test tools as ConversationTool-compatible definitions", () => {
    const { bridge } = createBridge();
    const tools = createTestingTools(bridge);

    expect(tools.map((tool) => tool.name)).toEqual([
      "test.run",
      "test.gen_cases",
      "test.scan",
      "test.report",
      "test.export_xmind",
      "test.prepare_env",
      "test.session",
    ]);

    for (const tool of tools) {
      expect(tool.permission).toBeString();
      expect(tool.toolset).toBe("qa-workflows");
      expect(tool.execute).toBeFunction();
    }
  });

  test("routes test.run by actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.run")!;

    const result = await tool.execute({ target: "login" }, ctx);

    expect(result.summary).toContain("playwright.runPlan");
    expect(calls[0]).toContain("playwright.runPlan");
  });

  test("routes script generation to skill.ui-script-gen actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.gen_cases")!;

    await tool.execute({ source: "login page", format: "playwright-script" }, ctx);

    expect(calls[0]).toContain("skill.ui-script-gen");
  });

  test("routes default case generation to skill.test-case-gen actionId", async () => {
    const { bridge, calls } = createBridge();
    const tool = createTestingTools(bridge).find((item) => item.name === "test.gen_cases")!;

    await tool.execute({ source: "登录需求" }, ctx);

    expect(calls[0]).toContain("skill.test-case-gen");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test tests/conversation-agent/testing-tools.test.ts
```

Expected: fail with module not found for `packages/conversation-agent/src/testing/tools`.

- [ ] **Step 3: Implement compatible testing tool definitions**

Create `packages/conversation-agent/src/testing/tools.ts`:

```ts
import type {
  ConversationTool,
  ToolContext,
  ToolPermission,
  ToolResult,
  ToolsetName,
} from "../types";

export type TestingToolName =
  | "test.run"
  | "test.gen_cases"
  | "test.scan"
  | "test.report"
  | "test.export_xmind"
  | "test.prepare_env"
  | "test.session";

export type TestingActionId =
  | "playwright.runPlan"
  | "playwright.runPlan.real"
  | "staticScan.scanDiff"
  | "xmind.export"
  | "report.generateHtmlReport"
  | "report.generateAllureReport"
  | "zentao.syncIssue"
  | "lanhu.fetchRequirement"
  | "knowledge.consult"
  | "skill.test-case-gen"
  | "skill.ui-script-gen"
  | "session.save"
  | "session.resume"
  | "session.summary"
  | "session.list";

export interface TestingActionBridge {
  executeAction(
    actionId: TestingActionId,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;
}

export interface TestingToolDefinition extends ConversationTool {
  name: TestingToolName;
  permission: ToolPermission;
  toolset: ToolsetName;
}

function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: true };
}

function isPlaywrightScript(input: Record<string, unknown>): boolean {
  return input.format === "playwright-script" || input.kind === "ui-script";
}

function sessionAction(input: Record<string, unknown>): TestingActionId {
  const action = String(input.action ?? "summary");
  if (action === "save") return "session.save";
  if (action === "resume") return "session.resume";
  if (action === "list") return "session.list";
  return "session.summary";
}

function makeTool(input: {
  name: TestingToolName;
  description: string;
  permission: ToolPermission;
  inputSchema: Record<string, unknown>;
  actionId: (input: Record<string, unknown>) => TestingActionId;
  bridge: TestingActionBridge;
}): TestingToolDefinition {
  return {
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    permission: input.permission,
    toolset: "qa-workflows",
    execute: async (toolInput, context) =>
      input.bridge.executeAction(input.actionId(toolInput), toolInput, context),
  };
}

export function createTestingTools(bridge: TestingActionBridge): TestingToolDefinition[] {
  return [
    makeTool({
      name: "test.run",
      description: "Run a testing plan or targeted regression through Playwright action IDs.",
      permission: "command",
      inputSchema: schema({
        target: { type: "string" },
        mode: { type: "string", enum: ["mock", "real"] },
      }),
      actionId: (input) => input.mode === "real" ? "playwright.runPlan.real" : "playwright.runPlan",
      bridge,
    }),
    makeTool({
      name: "test.gen_cases",
      description: "Generate test cases or UI scripts through skill action IDs.",
      permission: "workspace-write",
      inputSchema: schema({
        source: { type: "string" },
        format: { type: "string" },
      }),
      actionId: (input) => isPlaywrightScript(input) ? "skill.ui-script-gen" : "skill.test-case-gen",
      bridge,
    }),
    makeTool({
      name: "test.scan",
      description: "Run static test/workspace risk scanning.",
      permission: "safe",
      inputSchema: schema({ target: { type: "string" } }),
      actionId: () => "staticScan.scanDiff",
      bridge,
    }),
    makeTool({
      name: "test.report",
      description: "Generate local reports, or explicitly sync an issue when requested.",
      permission: "workspace-write",
      inputSchema: schema({
        format: { type: "string", enum: ["html", "allure", "zentao"] },
      }),
      actionId: (input) => {
        if (input.format === "allure") return "report.generateAllureReport";
        if (input.format === "zentao") return "zentao.syncIssue";
        return "report.generateHtmlReport";
      },
      bridge,
    }),
    makeTool({
      name: "test.export_xmind",
      description: "Export testing points or cases to XMind.",
      permission: "workspace-write",
      inputSchema: schema({ title: { type: "string" } }),
      actionId: () => "xmind.export",
      bridge,
    }),
    makeTool({
      name: "test.prepare_env",
      description: "Fetch or prepare requirement/testing context before execution.",
      permission: "external",
      inputSchema: schema({ sourceUrl: { type: "string" } }),
      actionId: () => "lanhu.fetchRequirement",
      bridge,
    }),
    makeTool({
      name: "test.session",
      description: "Save, resume, list, or summarize testing session context.",
      permission: "safe",
      inputSchema: schema({
        action: { type: "string", enum: ["save", "resume", "summary", "list"] },
        sessionId: { type: "string" },
      }),
      actionId: sessionAction,
      bridge,
    }),
  ];
}
```

- [ ] **Step 4: Export tools**

Modify `packages/conversation-agent/src/testing/index.ts`:

```ts
export * from "./workspace";
export * from "./system-prompt";
export * from "./tools";
```

- [ ] **Step 5: Pass tests**

Run:

```bash
bun test tests/conversation-agent/testing-tools.test.ts tests/conversation-agent/tool-runtime.test.ts tests/conversation-agent/types.test.ts
```

Expected: pass; tool results use `summary`, not `output`.

- [ ] **Step 6: Commit**

```bash
git add packages/conversation-agent/src/testing/tools.ts packages/conversation-agent/src/testing/index.ts tests/conversation-agent/testing-tools.test.ts
git commit -m "feat: add testing tool action facade"
```

---

### Task 4: CLI Bridge And Tool Registration

**Goal:** Register test tools from `apps/cli/src/chat.ts` and keep runtime/plugin bridge ownership in the CLI layer.

**Files:**

- Create: `apps/cli/src/chat-testing-actions.ts`
- Modify: `apps/cli/src/chat.ts`
- Modify: `tests/conversation-agent/chat-cli.test.ts`

- [ ] **Step 1: Write failing CLI registration test**

Add to `tests/conversation-agent/chat-cli.test.ts`:

```ts
import { createTestingTools } from "../../packages/conversation-agent/src/testing/tools";

test("testing tools expose conversation-agent compatible metadata", () => {
  const tools = createTestingTools({
    executeAction: async (actionId) => ({
      ok: true,
      summary: `executed ${actionId}`,
      data: { actionId },
    }),
  });

  expect(tools.find((tool) => tool.name === "test.run")?.permission).toBe("command");
  expect(tools.find((tool) => tool.name === "test.run")?.toolset).toBe("qa-workflows");
  expect(tools.find((tool) => tool.name === "test.gen_cases")?.permission).toBe("workspace-write");
});
```

- [ ] **Step 2: Run CLI test and verify failure**

Run:

```bash
bun test tests/conversation-agent/chat-cli.test.ts
```

Expected: fail until testing tool module exists and is exported.

- [ ] **Step 3: Add CLI action bridge**

Create `apps/cli/src/chat-testing-actions.ts`:

```ts
import type {
  TestingActionBridge,
  TestingActionId,
} from "../../../packages/conversation-agent/src/testing/tools";
import type { ToolContext, ToolResult } from "../../../packages/conversation-agent/src/types";

export interface ChatTestingActionBridgeOptions {
  workspaceRoot: string;
}

function unsupported(actionId: TestingActionId): ToolResult {
  return {
    ok: false,
    summary: `Testing action is not wired in chat mode yet: ${actionId}`,
    error: {
      code: "ACTION_NOT_WIRED",
      retryable: false,
      message: `No chat bridge handler is registered for actionId ${actionId}`,
    },
  };
}

export function createChatTestingActionBridge(
  _options: ChatTestingActionBridgeOptions,
): TestingActionBridge {
  return {
    async executeAction(
      actionId: TestingActionId,
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      if (actionId === "session.summary") {
        return {
          ok: true,
          summary: `Testing session ${context.sessionId} in ${context.workspaceRoot}`,
          data: { actionId, input },
        };
      }

      if (actionId === "session.list") {
        return {
          ok: true,
          summary: "Use /sessions to list recent conversation sessions.",
          data: { actionId },
        };
      }

      return unsupported(actionId);
    },
  };
}
```

This bridge is intentionally actionId-shaped. Later tasks may replace unsupported branches with `PluginActionRegistry.execute(actionId, input, actionContext)` or `SkillRunner.start(...)`, but must keep the same `executeAction(actionId, input, context)` contract.

- [ ] **Step 4: Register test tools in chat startup**

Modify `apps/cli/src/chat.ts`:

```ts
import { createTestingTools, discoverTestingWorkspace } from "../../../packages/conversation-agent/src/testing";
import { createChatTestingActionBridge } from "./chat-testing-actions";
```

Inside `startChat`, after `workspaceRoot` is resolved and before creating the agent:

```ts
const testingWorkspace = discoverTestingWorkspace(workspaceRoot);
```

Pass it into the agent:

```ts
const agent = new ConversationAgent({
  sessionDir,
  workspaceRoot,
  model,
  provider,
  apiKey,
  apiBase,
  stream,
  testingWorkspace,
});
```

Register testing tools at the existing tool registration point in `apps/cli/src/chat.ts`:

```ts
const testingTools = createTestingTools(
  createChatTestingActionBridge({ workspaceRoot }),
);
for (const tool of testingTools) {
  agent.registerTool(tool);
}
```

Do not create or modify a nonexistent aggregate tool registration file.

- [ ] **Step 5: Update startup banner**

Modify the existing banner in `apps/cli/src/chat.ts`:

```ts
console.log("║    Kata Agent Chat — Testing CLI v0.6    ║");
console.log(`  Workspace : ${workspaceRoot}`);
console.log(`  Model     : ${model} (${provider})`);
console.log(`  Session   : ${agent.sessionId}`);
console.log(`  Features  : ${testingWorkspace.featureCount}`);
console.log(`  Specs     : ${testingWorkspace.specCount}`);
console.log(`  Reports   : ${testingWorkspace.reportCount}`);
```

- [ ] **Step 6: Pass CLI tests**

Run:

```bash
bun test tests/conversation-agent/chat-cli.test.ts tests/conversation-agent/agent.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/chat-testing-actions.ts apps/cli/src/chat.ts tests/conversation-agent/chat-cli.test.ts
git commit -m "feat: register testing tools in chat cli"
```

---

### Task 5: Extend Existing IntentBias

**Goal:** Add testing workflow hints to the existing `IntentBias` class without introducing a parallel class.

**Files:**

- Modify: `packages/conversation-agent/src/intent.ts`
- Modify: `tests/conversation-agent/intent.test.ts`

- [ ] **Step 1: Write failing intent tests**

Add to `tests/conversation-agent/intent.test.ts`:

```ts
test("detects test-run workflow from regression wording", () => {
  const result = analyzer.analyze("帮我跑一下登录模块的回归测试");

  expect(result.workflow).toBe("test-run");
  expect(result.feature).toBe("登录");
});

test("detects static scan workflow", () => {
  const result = analyzer.analyze("扫描这个分支的测试风险");

  expect(result.workflow).toBe("test-scan");
});

test("detects report workflow", () => {
  const result = analyzer.analyze("整理这次执行的测试报告");

  expect(result.workflow).toBe("test-report");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test tests/conversation-agent/intent.test.ts
```

Expected: new tests fail because `IntentBias` does not yet detect these testing workflows.

- [ ] **Step 3: Extend keyword lists in the existing class file**

Modify `packages/conversation-agent/src/intent.ts`:

```ts
const WORKFLOW_KEYWORDS: Array<{ regex: RegExp; workflow: string }> = [
  { regex: /回归测试|跑.*测试|运行.*测试|test\s*run|regression/i, workflow: "test-run" },
  { regex: /测试用例|test\s*case/i, workflow: "test-case-gen" },
  { regex: /生成.*脚本|ui\s*script|playwright\s*script/i, workflow: "ui-script-gen" },
  { regex: /静态扫描|测试风险|scan/i, workflow: "test-scan" },
  { regex: /测试报告|执行报告|report/i, workflow: "test-report" },
  { regex: /xmind|脑图/i, workflow: "test-export-xmind" },
  { regex: /\bbug\b|缺陷/, workflow: "bug-report-gen" },
  { regex: /需求|requirement/i, workflow: "requirement-spec-gen" },
];
```

Update feature extraction if needed, still inside the same `IntentBias` class:

```ts
const FEATURE_MODULE_PATTERN = /([\u4e00-\u9fffA-Za-z0-9_-]{2,30})(?:模块|功能)/;
```

In `analyze`, check `FEATURE_MODULE_PATTERN` before the old Chinese feature pattern.

- [ ] **Step 4: Pass intent tests**

Run:

```bash
bun test tests/conversation-agent/intent.test.ts
```

Expected: pass. Existing tests for `test-case-gen`, bug, requirement, resume, URL, and external-effect hints still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/conversation-agent/src/intent.ts tests/conversation-agent/intent.test.ts
git commit -m "feat: extend intent bias for testing workflows"
```

---

### Task 6: Testing Slash Commands

**Goal:** Add testing slash commands through the existing closed `SlashCommand` type and `ConversationAgent.handleSlashCommand()`.

**Files:**

- Create: `packages/conversation-agent/src/testing/slash-commands.ts`
- Create: `tests/conversation-agent/testing-slash-commands.test.ts`
- Modify: `packages/conversation-agent/src/types.ts`
- Modify: `packages/conversation-agent/src/prompts.ts`
- Modify: `packages/conversation-agent/src/agent.ts`
- Modify: `tests/conversation-agent/types.test.ts`
- Modify: `tests/conversation-agent/agent.test.ts`

- [ ] **Step 1: Write failing type tests**

Add to `tests/conversation-agent/types.test.ts`:

```ts
expect(commands).toContain("test-run");
expect(commands).toContain("test-list");
expect(commands).toContain("test-gen");
expect(commands).toContain("scan");
expect(commands).toContain("report");
expect(commands).toContain("features");
```

- [ ] **Step 2: Extend closed slash command union and runtime list**

Modify `packages/conversation-agent/src/types.ts`:

```ts
export type SlashCommand =
  | "help"
  | "status"
  | "new"
  | "model"
  | "tools"
  | "yolo"
  | "title"
  | "sessions"
  | "resume"
  | "test-run"
  | "test-list"
  | "test-gen"
  | "scan"
  | "report"
  | "features"
  | "exit";
```

Also update `ALL_SLASH_COMMANDS` with the same new command strings.

- [ ] **Step 3: Write slash command handler tests**

Create `tests/conversation-agent/testing-slash-commands.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { handleTestingSlashCommand } from "../../packages/conversation-agent/src/testing/slash-commands";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";

const context: ToolContext = {
  workspaceRoot: "/repo",
  sessionId: "session-1",
  yolo: true,
  env: {},
};

describe("handleTestingSlashCommand", () => {
  test("lists workspace features", async () => {
    const result = await handleTestingSlashCommand({
      command: "/features",
      context,
      workspace: {
        root: "/repo",
        name: "demo",
        status: "ready",
        featureCount: 1,
        specCount: 0,
        caseAssetCount: 0,
        reportCount: 0,
        featureFiles: ["features/login.feature"],
      },
      executeTool: async () => ({ ok: true, summary: "unused" }),
      listTestingTools: () => [],
    });

    expect(result).toContain("features/login.feature");
  });

  test("routes /test-run to test.run tool", async () => {
    const calls: string[] = [];
    const result = await handleTestingSlashCommand({
      command: "/test-run login",
      context,
      workspace: undefined,
      executeTool: async (name, input): Promise<ToolResult> => {
        calls.push(`${name}:${JSON.stringify(input)}`);
        return { ok: true, summary: "run queued" };
      },
      listTestingTools: () => ["test.run"],
    });

    expect(result).toBe("run queued");
    expect(calls[0]).toContain("test.run");
    expect(calls[0]).toContain("login");
  });
});
```

- [ ] **Step 4: Implement testing slash command handler**

Create `packages/conversation-agent/src/testing/slash-commands.ts`:

```ts
import type { ToolContext, ToolResult } from "../types";
import type { TestingWorkspaceSummary } from "./workspace";

export interface TestingSlashCommandInput {
  command: string;
  context: ToolContext;
  workspace?: TestingWorkspaceSummary;
  executeTool: (
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<ToolResult>;
  listTestingTools: () => string[];
}

export function isTestingSlashCommand(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return (
    lower.startsWith("/test-run") ||
    lower === "/test-list" ||
    lower.startsWith("/test-gen") ||
    lower.startsWith("/scan") ||
    lower.startsWith("/report") ||
    lower === "/features"
  );
}

function tail(command: string, prefix: string): string {
  return command.trim().slice(prefix.length).trim();
}

export async function handleTestingSlashCommand(
  input: TestingSlashCommandInput,
): Promise<string> {
  const lower = input.command.trim().toLowerCase();

  if (lower === "/test-list") {
    const tools = input.listTestingTools();
    return tools.length > 0 ? tools.map((name) => `- ${name}`).join("\n") : "暂无测试工具。";
  }

  if (lower === "/features") {
    const files = input.workspace?.featureFiles ?? [];
    return files.length > 0 ? files.map((file) => `- ${file}`).join("\n") : "未发现 feature 文件。";
  }

  if (lower.startsWith("/test-run")) {
    return (await input.executeTool("test.run", { target: tail(input.command, "/test-run") }, input.context)).summary;
  }

  if (lower.startsWith("/test-gen")) {
    return (await input.executeTool("test.gen_cases", { source: tail(input.command, "/test-gen") }, input.context)).summary;
  }

  if (lower.startsWith("/scan")) {
    return (await input.executeTool("test.scan", { target: tail(input.command, "/scan") }, input.context)).summary;
  }

  if (lower.startsWith("/report")) {
    return (await input.executeTool("test.report", { target: tail(input.command, "/report") }, input.context)).summary;
  }

  return "未知测试命令。";
}
```

Export it from `packages/conversation-agent/src/testing/index.ts`:

```ts
export * from "./slash-commands";
```

- [ ] **Step 5: Wire into `ConversationAgent.handleSlashCommand()`**

Modify `packages/conversation-agent/src/agent.ts`:

```ts
import {
  handleTestingSlashCommand,
  isTestingSlashCommand,
} from "./testing/slash-commands";
```

At the start of `handleSlashCommand`, after `trimmed` and `lower` are computed:

```ts
if (isTestingSlashCommand(trimmed)) {
  const context = {
    workspaceRoot: this.config.workspaceRoot,
    sessionId: this.sessionId,
    yolo: this.yolo,
    env: {},
  };
  return handleTestingSlashCommand({
    command: trimmed,
    context,
    workspace: this.config.testingWorkspace,
    executeTool: (name, input, toolContext) =>
      this.runtime.execute(name, input, toolContext),
    listTestingTools: () =>
      this.runtime.listTools()
        .filter((tool) => tool.name.startsWith("test."))
        .map((tool) => tool.name),
  });
}
```

- [ ] **Step 6: Update slash command docs in prompt**

Modify `SLASH_COMMAND_DOCS` in `packages/conversation-agent/src/prompts.ts`:

```text
  /test-run  Run tests through test.run
  /test-list List testing tools
  /test-gen  Generate test cases through test.gen_cases
  /scan      Run test/workspace risk scanning
  /report    Generate a testing report
  /features  List discovered feature files
```

- [ ] **Step 7: Pass slash command tests**

Run:

```bash
bun test tests/conversation-agent/testing-slash-commands.test.ts tests/conversation-agent/types.test.ts tests/conversation-agent/agent.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/conversation-agent/src/testing/slash-commands.ts packages/conversation-agent/src/testing/index.ts packages/conversation-agent/src/types.ts packages/conversation-agent/src/prompts.ts packages/conversation-agent/src/agent.ts tests/conversation-agent/testing-slash-commands.test.ts tests/conversation-agent/types.test.ts tests/conversation-agent/agent.test.ts
git commit -m "feat: add testing slash commands"
```

---

### Task 7: Final Integration Verification

**Goal:** Verify the v0.6 plan preserves existing runtime behavior and catches the review regressions.

**Files:**

- Modify only if failures reveal a real integration issue in files touched above.

- [ ] **Step 1: Run focused conversation-agent tests**

Run:

```bash
bun test tests/conversation-agent
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run full test suite if focused checks pass**

Run:

```bash
bun test
```

Expected: pass, or document unrelated existing failures with exact test names.

- [ ] **Step 4: Manual smoke test for chat registration**

Run:

```bash
KATA_AGENT_API_KEY=test-key bun apps/cli/src/index.ts chat --root .
```

Expected startup output includes:

```text
Kata Agent Chat — Testing CLI v0.6
Features  :
Specs     :
Reports   :
```

Then type:

```text
/test-list
```

Expected response contains:

```text
test.run
test.gen_cases
test.scan
test.report
test.export_xmind
test.prepare_env
test.session
```

- [ ] **Step 5: Self-review compatibility checklist**

Before claiming complete, inspect the final diff and confirm:

- No planned source path begins with the removed root-level source tree.
- `TestingToolDefinition` has `permission` and `toolset`.
- Every `ToolResult` literal uses `summary`.
- `apps/cli/src/chat.ts` is the tool registration point.
- `IntentBias` changes are inside `packages/conversation-agent/src/intent.ts`.
- New slash commands are present in both `SlashCommand` and `ALL_SLASH_COMMANDS`.
- Plugin/skill bridge calls use `actionId`.

- [ ] **Step 6: Commit**

```bash
git add packages/conversation-agent/src apps/cli/src tests/conversation-agent
git commit -m "feat: integrate testing cli mode"
```

## Execution Notes

- Start with Tasks 1-3 to establish types and unit coverage before wiring CLI behavior.
- Task 4 intentionally keeps registration in `apps/cli/src/chat.ts`; helper files may define bridge behavior, but registration stays in chat startup.
- Task 6 must update the closed slash command union and runtime array together.
- External actions such as `lanhu.fetchRequirement`, `zentao.syncIssue`, and real browser runs must remain permission-gated by the existing `ToolRuntime`.

## Plan Self-Review

Spec coverage:

- Correct monorepo paths are used for every conversation-agent and CLI source file.
- Testing tool contracts are compatible with `ConversationTool`.
- `ToolResult.summary` is used throughout tool and bridge code.
- CLI registration point is `apps/cli/src/chat.ts`.
- Intent detection extends existing `IntentBias`.
- Slash commands extend the closed union and runtime list.
- Plugin/skill routing uses `actionId`.

Placeholder scan:

- No `TBD`, deferred placeholders, or unspecified error-handling steps remain.
- The only unsupported bridge branches are explicit runtime behavior with `ACTION_NOT_WIRED` `ToolResult.summary` and are isolated to Task 4's initial CLI bridge.

Type consistency:

- `TestingWorkspaceSummary` is shared by `AgentConfig`, prompt options, and slash commands.
- `TestingToolDefinition` extends `ConversationTool`.
- `TestingActionBridge.executeAction()` returns `Promise<ToolResult>`.
- Slash command tests route through `ToolRuntime.execute()` compatible call signatures.
