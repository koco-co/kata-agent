# kata-agent v0.5 Natural Language Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive natural-language chat mode to kata-agent. Users run `bun apps/cli/src/index.ts chat` for an NL-driven conversation loop with tool calling.

**Architecture:** New `packages/conversation-agent/` package with ConversationAgent loop (build context → call model → execute tools → repeat), SessionStore (JSONL + atomic locks), ToolRuntime (register tools, validate args, check permissions, execute handlers), IntentBias (lightweight workflow detection), and SecretRedactor (pre-provider redaction). Chat CLI entrypoint at `apps/cli/src/chat.ts` with slash commands.

**Tech Stack:** TypeScript, Bun workspaces, Bun test, existing @kata-agent/* packages, OpenAI-compatible HTTP provider API, path/fetch/fs from Node stdlib.

---

## Scope Source

Design spec: `docs/superpowers/specs/2026-05-02-kata-agent-natural-language-runtime-design.md`

Included:
| # | Item | Rationale |
|---|------|-----------|
| 1 | `packages/conversation-agent/` with agent loop, session store, tool runtime | Core NL runtime |
| 2 | QA workflow tools, artifact tools, knowledge tools | Reuse existing engine |
| 3 | File tools with path canonicalization | Safety foundation |
| 4 | Shell tools with classification + sandbox | Controlled execution |
| 5 | Approval tools + permission model | Security gates |
| 6 | SecretRedactor (pre-provider + log redaction) | Audit compliance |
| 7 | Chat CLI with slash commands | User-facing entrypoint |
| 8 | Intent bias (workflow intent extraction) | UX polish |

Excluded:
- Messaging gateways (DingTalk, Slack, Telegram) — deferred to v0.6
- TUI with rich streaming layout
- Subagents and parallel delegated workstreams
- Long-term memory / knowledge nudges
- MCP integration

---

## File Structure

### Package Scaffolding

- Create `packages/conversation-agent/package.json`
  - name: `@kata-agent/conversation-agent`
- Create `packages/conversation-agent/src/types.ts`
  - `ConversationTool`, `ToolResult`, `ToolPermission`, `ToolContext`, `SessionState`
- Create `packages/conversation-agent/src/session-store.ts`
  - `SessionStore` class: JSONL append, atomic lock, stale recovery, read, archival
- Create `packages/conversation-agent/src/tool-runtime.ts`
  - `ToolRuntime` class: register, validate, execute, permission check
- Create `packages/conversation-agent/src/agent.ts`
  - `ConversationAgent` class: conversational loop
- Create `packages/conversation-agent/src/intent.ts`
  - `IntentBias` class: extract workflow/project/feature from NL
- Create `packages/conversation-agent/src/prompts.ts`
  - System prompt builder, context builder, tool schema builder
- Create `packages/conversation-agent/src/secret-redactor.ts`
  - `SecretRedactor` class: pattern-based redaction for all sources
- Create `packages/conversation-agent/src/tools/workflow-tools.ts`
  - `workflow.start`, `workflow.status`, `workflow.resume`, `workflow.import_confirmation`, `workflow.find_runs`
- Create `packages/conversation-agent/src/tools/artifact-tools.ts`
  - `artifact.list`, `artifact.read`, `artifact.summarize`
- Create `packages/conversation-agent/src/tools/knowledge-tools.ts`
  - `knowledge.search`, `knowledge.suggestions`, `knowledge.accept`, `knowledge.reject`
- Create `packages/conversation-agent/src/tools/file-tools.ts`
  - `file.list`, `file.read`, `file.write`, `file.apply_patch` with path canonicalization
- Create `packages/conversation-agent/src/tools/shell-tools.ts`
  - `shell.exec` with command classification, sandbox, truncation
- Create `packages/conversation-agent/src/tools/approval-tools.ts`
  - Approval prompt, timeout, log
- Create `packages/conversation-agent/src/index.ts`
  - Re-export all public types and classes

### Chat CLI

- Create `apps/cli/src/chat.ts`
  - Readline-based prompt, slash command dispatch, agent loop orchestration
- Modify `apps/cli/src/index.ts`
  - Add `chat` command

### Config

- Modify `packages/core/src/index.ts` (or add env loading)
  - Load `KATA_AGENT_MODEL`, `KATA_AGENT_PROVIDER`, `KATA_AGENT_API_KEY`, etc.

### Tests

- Create `tests/conversation-agent/types.test.ts`
- Create `tests/conversation-agent/session-store.test.ts`
- Create `tests/conversation-agent/tool-runtime.test.ts`
- Create `tests/conversation-agent/agent.test.ts`
- Create `tests/conversation-agent/intent.test.ts`
- Create `tests/conversation-agent/secret-redactor.test.ts`
- Create `tests/conversation-agent/file-tools.test.ts`
- Create `tests/conversation-agent/shell-tools.test.ts`
- Create `tests/conversation-agent/approval-tools.test.ts`
- Create `tests/conversation-agent/chat-cli.test.ts`
- Create `tests/conversation-agent/integration.test.ts`

---

## Task 1: Package Scaffolding + Types

**Objective:** Create the `@kata-agent/conversation-agent` package with `package.json`, tsconfig, and core type definitions.

**Files:**
- Create: `packages/conversation-agent/package.json`
- Create: `packages/conversation-agent/src/types.ts`
- Create: `packages/conversation-agent/src/index.ts`

**Step 1: Create `packages/conversation-agent/package.json`**

```json
{
  "name": "@kata-agent/conversation-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@kata-agent/core": "workspace:*",
    "@kata-agent/domain": "workspace:*",
    "@kata-agent/workflow-engine": "workspace:*",
    "@kata-agent/artifact-repo": "workspace:*",
    "@kata-agent/knowledge-repo": "workspace:*"
  }
}
```

**Step 2: Write failing test**

```typescript
// tests/conversation-agent/types.test.ts
import { describe, it, expect } from "bun:test";

describe("ConversationTool interface", () => {
  it("defines required fields", () => {
    // Compile-time check — if types.ts compiles, this passes
    const tool: import("../../packages/conversation-agent/src/types").ConversationTool = {
      name: "test",
      description: "A test tool",
      inputSchema: { type: "object" },
      permission: "safe" as any,
      toolset: "shell" as any,
      execute: async () => ({ ok: true, summary: "done" }),
    };
    expect(tool.name).toBe("test");
    expect(tool.description).toBe("A test tool");
    expect(typeof tool.execute).toBe("function");
  });
});

describe("ToolResult type", () => {
  it("supports success and error shapes", () => {
    const ok: import("../../packages/conversation-agent/src/types").ToolResult = { ok: true, summary: "done" };
    const err: import("../../packages/conversation-agent/src/types").ToolResult = {
      ok: false,
      summary: "failed",
      error: { code: "ERR", retryable: false, message: "something broke" },
    };
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
    expect(err.error?.code).toBe("ERR");
  });
});
```

**Step 3: Run test to verify failure**

Run: `bun test tests/conversation-agent/types.test.ts`
Expected: FAIL — module not found

**Step 4: Create `packages/conversation-agent/src/types.ts`**

```typescript
// Permission levels for conversation tools
export type ToolPermission = "safe" | "workspace-write" | "command" | "external";

// Toolset names
export type ToolsetName = "qa-workflows" | "files" | "shell" | "artifacts" | "knowledge" | "external-plugins" | "approvals";

// Tool context passed to execute handlers
export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  yolo: boolean;
  env: Record<string, string>;
}

// Tool result shape
export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: {
    code: string;
    retryable: boolean;
    message: string;
  };
}

// Conversation tool definition
export interface ConversationTool {
  name: string;
  description: string;
  inputSchema: unknown;
  permission: ToolPermission;
  toolset: ToolsetName;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

// Session state persisted to JSONL
export interface SessionState {
  sessionId: string;
  messages: ChatMessage[];
  project?: string;
  feature?: string;
  recentRuns: string[];
  enabledToolsets: ToolsetName[];
  yolo: boolean;
  lastSummary?: string;
}

// Chat message types
export type ChatMessage = UserMessage | ToolCallMessage | ToolResultMessage | FinalMessage;

export interface UserMessage {
  role: "user";
  content: string;
}

export interface ToolCallMessage {
  role: "assistant";
  toolCalls: Array<{
    id: string;
    name: string;
    args: unknown;
  }>;
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  result: ToolResult;
}

export interface FinalMessage {
  role: "assistant";
  content: string;
}

// Slash commands
export type SlashCommand = "help" | "status" | "new" | "model" | "tools" | "yolo" | "exit";
```

**Step 5: Create `packages/conversation-agent/src/index.ts`**

```typescript
export type {
  ConversationTool,
  ToolResult,
  ToolPermission,
  ToolsetName,
  ToolContext,
  SessionState,
  ChatMessage,
  UserMessage,
  ToolCallMessage,
  ToolResultMessage,
  FinalMessage,
  SlashCommand,
} from "./types";
```

**Step 6: Run tests**

Run: `bun test tests/conversation-agent/types.test.ts`
Expected: PASS (type-level checks)

**Step 7: Commit**

```bash
git add packages/conversation-agent/ tests/conversation-agent/types.test.ts
git commit -m "feat: add conversation-agent package scaffolding and types"
```

---

## Task 2: SessionStore — JSONL Persistence with Atomic Lock

**Objective:** Implement session store with append-only JSONL, atomic lock files, stale-lock recovery, and session archival.

**Files:**
- Create: `packages/conversation-agent/src/session-store.ts`
- Create: `tests/conversation-agent/session-store.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/session-store.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const testDir = join(import.meta.dir, "../../.test-sessions");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("SessionStore", () => {
  it("creates a new session and appends messages", async () => {
    const { SessionStore } = await import("../../packages/conversation-agent/src/session-store");
    const store = new SessionStore(testDir);
    const sessionId = randomUUID();
    
    await store.appendMessage(sessionId, { role: "user", content: "hello" });
    await store.appendMessage(sessionId, { role: "assistant", content: "hi" });
    
    const messages = await store.readMessages(sessionId);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "hi" });
  });

  it("rejects parallel writes without corruption", async () => {
    const { SessionStore } = await import("../../packages/conversation-agent/src/session-store");
    const store = new SessionStore(testDir);
    const sessionId = randomUUID();
    
    const writes = Array.from({ length: 10 }, (_, i) =>
      store.appendMessage(sessionId, { role: "user", content: `msg-${i}` })
    );
    await Promise.all(writes);
    
    const messages = await store.readMessages(sessionId);
    expect(messages).toHaveLength(10);
    const contents = messages.map((m: any) => m.content).sort();
    expect(contents).toEqual(Array.from({ length: 10 }, (_, i) => `msg-${i}`));
  });

  it("recovers from stale lock files", async () => {
    const { SessionStore } = await import("../../packages/conversation-agent/src/session-store");
    const store = new SessionStore(testDir);
    const sessionId = randomUUID();
    
    // Write a stale lock with a dead PID
    const lockPath = join(testDir, `${sessionId}.lock`);
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, timestamp: Date.now() - 60000 }));
    
    // Should still work (stale lock recovery)
    await store.appendMessage(sessionId, { role: "user", content: "after stale lock" });
    const messages = await store.readMessages(sessionId);
    expect(messages).toHaveLength(1);
  });

  it("archives sessions after message limit", async () => {
    const { SessionStore } = await import("../../packages/conversation-agent/src/session-store");
    const store = new SessionStore(testDir, { maxMessages: 5 });
    const sessionId = randomUUID();
    
    for (let i = 0; i < 7; i++) {
      await store.appendMessage(sessionId, { role: "user", content: `msg-${i}` });
    }
    
    // Should have archived old messages
    const messages = await store.readMessages(sessionId);
    expect(messages.length).toBeLessThanOrEqual(5);
  });
});
```

**Step 2: Run test to verify failure**

Run: `bun test tests/conversation-agent/session-store.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `packages/conversation-agent/src/session-store.ts`**

```typescript
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, SessionState } from "./types";

export interface SessionStoreOptions {
  maxMessages?: number;
  maxSessionSize?: number; // bytes
}

export class SessionStore {
  private dir: string;
  private options: Required<SessionStoreOptions>;

  constructor(dir: string, options: SessionStoreOptions = {}) {
    this.dir = dir;
    this.options = {
      maxMessages: options.maxMessages ?? 200,
      maxSessionSize: options.maxSessionSize ?? 5 * 1024 * 1024,
    };
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private lockPath(sessionId: string): string {
    return join(this.dir, `${sessionId}.lock`);
  }

  private sessionPath(sessionId: string): string {
    return join(this.dir, `${sessionId}.jsonl`);
  }

  private archivePath(sessionId: string): string {
    return join(this.dir, `${sessionId}.archive.jsonl`);
  }

  private acquireLock(sessionId: string): boolean {
    const lockPath = this.lockPath(sessionId);
    
    // Check for stale lock
    if (existsSync(lockPath)) {
      try {
        const content = JSON.parse(readFileSync(lockPath, "utf-8"));
        const { pid, timestamp } = content;
        const isStale = 
          (typeof pid === "number" && !this.isProcessAlive(pid)) ||
          (Date.now() - timestamp > 30000);
        
        if (isStale) {
          rmSync(lockPath);
        } else {
          return false; // Active lock
        }
      } catch {
        rmSync(lockPath);
      }
    }

    // Try to create lock atomically
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), { flag: "wx" });
      return true;
    } catch {
      return false;
    }
  }

  private releaseLock(sessionId: string): void {
    const lockPath = this.lockPath(sessionId);
    try { rmSync(lockPath); } catch { /* ignore */ }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      return process.kill(pid, 0);
    } catch {
      return false;
    }
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const lockPath = this.lockPath(sessionId);
    const sessionPath = this.sessionPath(sessionId);
    
    // Retry lock with backoff
    for (let attempt = 0; attempt < 10; attempt++) {
      if (this.acquireLock(sessionId)) {
        try {
          const line = JSON.stringify(message) + "\n";
          appendFileSync(sessionPath, line, "utf-8");
          
          // Check message count
          const content = readFileSync(sessionPath, "utf-8");
          const lines = content.split("\n").filter(Boolean);
          if (lines.length > this.options.maxMessages) {
            const archiveLines = lines.slice(0, lines.length - this.options.maxMessages);
            const keepLines = lines.slice(lines.length - this.options.maxMessages);
            
            // Append archive
            const archivePath = this.archivePath(sessionId);
            appendFileSync(archivePath, archiveLines.join("\n") + "\n", "utf-8");
            
            // Rewrite session
            writeFileSync(sessionPath, keepLines.join("\n") + "\n", "utf-8");
          }
          
          return;
        } finally {
          this.releaseLock(sessionId);
        }
      }
      await new Promise(r => setTimeout(r, 10 * Math.pow(2, attempt)));
    }
    throw new Error("Failed to acquire session lock after 10 attempts");
  }

  async readMessages(sessionId: string): Promise<ChatMessage[]> {
    const sessionPath = this.sessionPath(sessionId);
    if (!existsSync(sessionPath)) return [];
    
    const content = readFileSync(sessionPath, "utf-8");
    return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
  }
}
```

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/session-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/session-store.ts tests/conversation-agent/session-store.test.ts
git commit -m "feat: add SessionStore with JSONL persistence and atomic locks"
```

---

## Task 3: ToolRuntime — Tool Registry, Permission Check, Execution

**Objective:** Implement ToolRuntime that registers ConversationTools, validates inputs, checks permissions, executes handlers, and returns ToolResult.

**Files:**
- Create: `packages/conversation-agent/src/tool-runtime.ts`
- Create: `tests/conversation-agent/tool-runtime.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/tool-runtime.test.ts
import { describe, it, expect } from "bun:test";
import type { ConversationTool, ToolContext } from "../../packages/conversation-agent/src/types";

describe("ToolRuntime", () => {
  it("registers and executes a tool", async () => {
    const { ToolRuntime } = await import("../../packages/conversation-agent/src/tool-runtime");
    const runtime = new ToolRuntime();
    const ctx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: false, env: {} };
    
    runtime.register({
      name: "test",
      description: "test tool",
      inputSchema: { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
      permission: "safe",
      toolset: "shell",
      execute: async (input: any) => ({ ok: true, summary: input.msg }),
    });
    
    const result = await runtime.execute("test", { msg: "hello" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("hello");
  });

  it("denies execution for unregistered tool", async () => {
    const { ToolRuntime } = await import("../../packages/conversation-agent/src/tool-runtime");
    const runtime = new ToolRuntime();
    const ctx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: false, env: {} };
    
    const result = await runtime.execute("nonexistent", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNKNOWN_TOOL");
  });

  it("enforces permission checks: external requires approval", async () => {
    const { ToolRuntime } = await import("../../packages/conversation-agent/src/tool-runtime");
    const runtime = new ToolRuntime();
    const ctx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: false, env: {} };
    
    runtime.register({
      name: "ext-tool",
      description: "external tool",
      inputSchema: { type: "object" },
      permission: "external",
      toolset: "external-plugins" as any,
      execute: async () => ({ ok: true, summary: "done" }),
    });
    
    const result = await runtime.execute("ext-tool", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NEEDS_APPROVAL");
  });

  it("yolo mode auto-approves command tools", async () => {
    const { ToolRuntime } = await import("../../packages/conversation-agent/src/tool-runtime");
    const runtime = new ToolRuntime();
    const ctx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: true, env: {} };
    
    runtime.register({
      name: "cmd-tool",
      description: "command tool",
      inputSchema: { type: "object" },
      permission: "command",
      toolset: "shell" as any,
      execute: async () => ({ ok: true, summary: "done" }),
    });
    
    const result = await runtime.execute("cmd-tool", {}, ctx);
    expect(result.ok).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `bun test tests/conversation-agent/tool-runtime.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `packages/conversation-agent/src/tool-runtime.ts`**

```typescript
import type { ConversationTool, ToolResult, ToolContext, ToolPermission } from "./types";

export class ToolRuntime {
  private tools: Map<string, ConversationTool> = new Map();

  register(tool: ConversationTool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ConversationTool | undefined {
    return this.tools.get(name);
  }

  listTools(): ConversationTool[] {
    return Array.from(this.tools.values());
  }

  listToolsByToolset(toolset: string): ConversationTool[] {
    return this.listTools().filter(t => t.toolset === toolset);
  }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        summary: `Unknown tool: ${name}`,
        error: { code: "UNKNOWN_TOOL", retryable: false, message: `Tool '${name}' is not registered` },
      };
    }

    // Permission check
    const permissionResult = this.checkPermission(tool, context);
    if (!permissionResult.allowed) {
      return {
        ok: false,
        summary: permissionResult.reason!,
        error: { code: permissionResult.code!, retryable: false, message: permissionResult.reason! },
      };
    }

    // Execute
    try {
      return await tool.execute(input, context);
    } catch (err) {
      return {
        ok: false,
        summary: `Tool execution error: ${err}`,
        error: { code: "EXECUTION_ERROR", retryable: true, message: String(err) },
      };
    }
  }

  private checkPermission(tool: ConversationTool, context: ToolContext): { allowed: boolean; code?: string; reason?: string } {
    // safe tools are always allowed
    if (tool.permission === "safe") return { allowed: true };

    // In yolo mode, command tools are auto-approved
    if (context.yolo && tool.permission === "command") return { allowed: true };

    // workspace-write is always allowed but logged
    if (tool.permission === "workspace-write") return { allowed: true };

    // command tools in non-yolo mode need approval
    if (tool.permission === "command") {
      return { allowed: false, code: "NEEDS_APPROVAL", reason: "Command tool requires approval. Use /yolo to auto-approve commands." };
    }

    // external tools always need approval regardless of yolo
    if (tool.permission === "external") {
      return { allowed: false, code: "NEEDS_APPROVAL", reason: "External tool requires explicit approval." };
    }

    return { allowed: true };
  }
}
```

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/tool-runtime.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/tool-runtime.ts tests/conversation-agent/tool-runtime.test.ts
git commit -m "feat: add ToolRuntime with registration and permission checks"
```

---

## Task 4: File Tools with Path Canonicalization

**Objective:** Implement file tools (list, read, write, apply_patch) with strict path canonicalization that prevents traversal attacks and symlink escapes.

**Files:**
- Create: `packages/conversation-agent/src/tools/file-tools.ts`
- Create: `tests/conversation-agent/file-tools.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/file-tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ToolContext } from "../../packages/conversation-agent/src/types";

const testDir = join(import.meta.dir, "../../.test-file-tools");
const workspaceRoot = join(testDir, "workspace");
const outsideDir = join(testDir, "outside");
const ctx: ToolContext = { workspaceRoot, sessionId: "test", yolo: false, env: {} };

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(join(workspaceRoot, "hello.txt"), "world\n");
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("FileTools", () => {
  it("reads a file inside workspace", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "hello.txt" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("world");
  });

  it("rejects path traversal (../)", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "../outside/secret.txt" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PATH_TRAVERSAL");
  });

  it("rejects absolute path outside workspace", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "/etc/passwd" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PATH_TRAVERSAL");
  });

  it("rejects home directory expansion", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "~/secret.txt" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PATH_TRAVERSAL");
  });

  it("writes a new file inside workspace (create parent dir)", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute({ path: "newdir/test.txt", content: "hello" }, ctx);
    expect(result.ok).toBe(true);
    expect(existsSync(join(workspaceRoot, "newdir/test.txt"))).toBe(true);
  });

  it("rejects file size > 2MB limit", async () => {
    const { createFileTools } = await import("../../packages/conversation-agent/src/tools/file-tools");
    const tools = createFileTools(workspaceRoot);
    const largeContent = "x".repeat(3 * 1024 * 1024);
    const result = await tools.file_write.execute({ path: "large.txt", content: largeContent }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("FILE_TOO_LARGE");
  });
});
```

**Step 2: Run test to verify failure**

Run: `bun test tests/conversation-agent/file-tools.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `packages/conversation-agent/src/tools/file-tools.ts`**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, resolve, dirname, normalize, isAbsolute } from "node:path";
import type { ConversationTool, ToolResult, ToolContext } from "../types";

function isPathInsideWorkspace(requestedPath: string, workspaceRoot: string): { allowed: boolean; resolved?: string; error?: string } {
  // Reject home directory expansion
  if (requestedPath.startsWith("~")) {
    return { allowed: false, error: "Home directory expansion is not allowed" };
  }

  // Resolve relative to workspace
  const resolved = resolve(workspaceRoot, requestedPath);
  
  // Check it starts with workspace root + separator
  const normalizedRoot = resolve(workspaceRoot) + "/";
  if (!resolved.startsWith(normalizedRoot)) {
    return { allowed: false, error: "Path escapes workspace" };
  }

  // For existing files: use realpath to resolve symlinks
  if (existsSync(resolved)) {
    try {
      const real = realpathSync(resolved);
      if (!real.startsWith(normalizedRoot)) {
        return { allowed: false, error: "Symlink target escapes workspace" };
      }
      return { allowed: true, resolved: real };
    } catch {
      return { allowed: false, error: "Cannot resolve real path" };
    }
  }

  // For new files: check parent directories for symlink escapes
  const parentResolved = resolve(dirname(resolved));
  if (!parentResolved.startsWith(normalizedRoot)) {
    return { allowed: false, error: "Parent directory escapes workspace" };
  }
  
  // Check each parent component
  let current = resolved;
  while (current !== workspaceRoot && current.length > workspaceRoot.length) {
    const parent = dirname(current);
    if (existsSync(parent)) {
      try {
        const realParent = realpathSync(parent);
        if (!realParent.startsWith(normalizedRoot)) {
          return { allowed: false, error: "Parent symlink escapes workspace" };
        }
      } catch {
        return { allowed: false, error: "Cannot resolve parent path" };
      }
    }
    current = parent;
  }
  
  return { allowed: true, resolved };
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export function createFileTools(workspaceRoot: string): Record<string, ConversationTool> {
  function fileList(): ConversationTool ({
    name: "file.list",
    description: "List files in a directory",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    permission: "safe" as const,
    toolset: "files" as any,
    async execute(input: any, context: ToolContext): Promise<ToolResult> {
      const { path } = input;
      const check = isPathInsideWorkspace(path, context.workspaceRoot);
      if (!check.allowed) {
        return { ok: false, summary: check.error!, error: { code: "PATH_TRAVERSAL", retryable: false, message: check.error! } };
      }
      try {
        const entries = readdirSync(check.resolved!);
        return { ok: true, summary: `Found ${entries.length} entries`, data: entries };
      } catch (err) {
        return { ok: false, summary: `Cannot list directory: ${err}`, error: { code: "LIST_ERROR", retryable: false, message: String(err) } };
      }
    },
  });

  function fileRead(): ConversationTool ({
    name: "file.read",
    description: "Read file contents",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    permission: "safe" as const,
    toolset: "files" as any,
    async execute(input: any, context: ToolContext): Promise<ToolResult> {
      const { path } = input;
      const check = isPathInsideWorkspace(path, context.workspaceRoot);
      if (!check.allowed) {
        return { ok: false, summary: check.error!, error: { code: "PATH_TRAVERSAL", retryable: false, message: check.error! } };
      }
      try {
        const stats = statSync(check.resolved!);
        if (stats.size > MAX_FILE_SIZE) {
          return { ok: false, summary: "File exceeds 2 MB size limit", error: { code: "FILE_TOO_LARGE", retryable: false, message: "Use artifact.read for large files" } };
        }
        const content = readFileSync(check.resolved!, "utf-8");
        return { ok: true, summary: `Read ${content.length} chars`, data: content };
      } catch (err) {
        return { ok: false, summary: `Cannot read file: ${err}`, error: { code: "READ_ERROR", retryable: false, message: String(err) } };
      }
    },
  });

  function fileWrite(): ConversationTool ({
    name: "file.write",
    description: "Write content to a file",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    permission: "workspace-write" as const,
    toolset: "files" as any,
    async execute(input: any, context: ToolContext): Promise<ToolResult> {
      const { path, content } = input;
      if (content && content.length > MAX_FILE_SIZE) {
        return { ok: false, summary: "Content exceeds 2 MB", error: { code: "FILE_TOO_LARGE", retryable: false, message: "File content too large" } };
      }
      const check = isPathInsideWorkspace(path, context.workspaceRoot);
      if (!check.allowed) {
        return { ok: false, summary: check.error!, error: { code: "PATH_TRAVERSAL", retryable: false, message: check.error! } };
      }
      try {
        mkdirSync(dirname(check.resolved!), { recursive: true });
        writeFileSync(check.resolved!, content ?? "", "utf-8");
        return { ok: true, summary: `Written ${(content ?? "").length} chars to ${path}` };
      } catch (err) {
        return { ok: false, summary: `Cannot write file: ${err}`, error: { code: "WRITE_ERROR", retryable: false, message: String(err) } };
      }
    },
  });

  return { file_list: fileList(), file_read: fileRead(), file_write: fileWrite() };
}
```

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/file-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/tools/file-tools.ts tests/conversation-agent/file-tools.test.ts
git commit -m "feat: add file tools with path canonicalization"
```

---

## Task 5: Shell Tools with Command Classification

**Objective:** Implement shell.exec tool with command safety classification (allowed/review/dangerous), output truncation, and sandbox isolation.

**Files:**
- Create: `packages/conversation-agent/src/tools/shell-tools.ts`
- Create: `tests/conversation-agent/shell-tools.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/shell-tools.test.ts
import { describe, it, expect } from "bun:test";
import type { ToolContext } from "../../packages/conversation-agent/src/types";
import { spawnSync } from "node:child_process";

const ctx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: false, env: {} };
const yoloCtx: ToolContext = { workspaceRoot: "/tmp", sessionId: "test", yolo: true, env: {} };

describe("ShellTools", () => {
  it("executes an allowed command", async () => {
    const { createShellTool } = await import("../../packages/conversation-agent/src/tools/shell-tools");
    const tool = createShellTool("/tmp");
    const result = await tool.execute({ command: "echo hello" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("hello");
  });

  it("truncates output > 50KB", async () => {
    const { createShellTool } = await import("../../packages/conversation-agent/src/tools/shell-tools");
    const tool = createShellTool("/tmp");
    const result = await tool.execute({ command: "python3 -c 'print(\"x\" * 60000)'" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("[truncated]");
  });

  it("rejects dangerous command even in yolo mode", async () => {
    const { createShellTool } = await import("../../packages/conversation-agent/src/tools/shell-tools");
    const tool = createShellTool("/tmp");
    const result = await tool.execute({ command: "rm -rf /" }, yoloCtx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DANGEROUS_COMMAND");
  });

  it("classifies git reset --hard as dangerous", async () => {
    const { createShellTool } = await import("../../packages/conversation-agent/src/tools/shell-tools");
    const tool = createShellTool("/tmp");
    const result = await tool.execute({ command: "git reset --hard" }, yoloCtx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DANGEROUS_COMMAND");
  });

  it("requires approval for review-level commands in non-yolo mode", async () => {
    const { createShellTool } = await import("../../packages/conversation-agent/src/tools/shell-tools");
    const tool = createShellTool("/tmp");
    const result = await tool.execute({ command: "git add ." }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NEEDS_APPROVAL");
  });
});
```

**Step 2: Run test to verify failure**

Run: `bun test tests/conversation-agent/shell-tools.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `packages/conversation-agent/src/tools/shell-tools.ts`**

```typescript
import { spawn } from "node:child_process";
import type { ConversationTool, ToolResult, ToolContext } from "../types";
import { resolve } from "node:path";

type CommandClass = "allowed" | "review" | "dangerous";

function classifyCommand(command: string): CommandClass {
  const lower = command.toLowerCase().trim();
  
  // Dangerous patterns
  const dangerousPatterns = [
    /^rm\s+-rf\s+\/$/,
    /^sudo\s+/,
    /^chmod\s+777\s+/,
    /curl\s+\S+\s*\|\s*(?:bash|sh|zsh)/,
    /^git\s+reset\s+--hard/,
    /^git\s+push\s+--force/,
    /^eval\s+/,
    /\$\s*\(.+\)/,
    /`[^`]+`/,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(lower)) return "dangerous";
  }

  // Allowed patterns (safe development commands)
  const allowedPatterns = [
    /^(?:ls|cat|head|tail|grep|find|echo|pwd|which)\b/,
    /^git\s+(?:status|log|diff)\b/,
    /^bun\s+(?:test|run\s+typecheck)\b/,
    /^npm\s+(?:test|run)\b/,
    /^pnpm\s+(?:test|run)\b/,
  ];
  
  for (const pattern of allowedPatterns) {
    if (pattern.test(lower)) return "allowed";
  }

  // Everything else is review
  return "review";
}

const MAX_OUTPUT_SIZE = 50 * 1024; // 50 KB
const COMMAND_TIMEOUT = 120_000; // 120 seconds

export function createShellTool(workspaceRoot: string): ConversationTool {
  return {
    name: "shell.exec",
    description: "Execute a shell command in the workspace",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    permission: "command" as const,
    toolset: "shell" as any,
    async execute(input: any, context: ToolContext): Promise<ToolResult> {
      const command = String(input.command ?? "");
      const classification = classifyCommand(command);

      // Dangerous commands are always rejected (even in yolo mode)
      if (classification === "dangerous") {
        return {
          ok: false,
          summary: `Dangerous command rejected: ${command}`,
          error: { code: "DANGEROUS_COMMAND", retryable: false, message: "This command is too dangerous to execute even in yolo mode" },
        };
      }

      // Review commands need approval in non-yolo mode
      if (classification === "review" && !context.yolo) {
        return {
          ok: false,
          summary: `Command requires approval: ${command}`,
          error: { code: "NEEDS_APPROVAL", retryable: false, message: "Use /yolo to auto-approve review-level commands" },
        };
      }

      // Execute command
      return new Promise((resolve) => {
        const child = spawn("sh", ["-c", command], {
          cwd: workspaceRoot,
          timeout: COMMAND_TIMEOUT,
          env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "" },
        });

        let stdout = "";
        let stderr = "";
        let truncated = false;

        child.stdout?.on("data", (data: Buffer) => {
          const remaining = MAX_OUTPUT_SIZE - stdout.length;
          if (remaining <= 0) {
            truncated = true;
            child.kill();
            return;
          }
          stdout += data.toString("utf-8").slice(0, remaining);
        });

        child.stderr?.on("data", (data: Buffer) => {
          const remaining = MAX_OUTPUT_SIZE - stderr.length;
          if (remaining <= 0) return;
          stderr += data.toString("utf-8").slice(0, remaining);
        });

        child.on("close", (exitCode) => {
          const output = stdout || stderr || "(no output)";
          const summary = truncated
            ? `${output.slice(0, 500)}... [truncated]`
            : output.slice(0, 2000);
          
          resolve({
            ok: exitCode === 0,
            summary: `Exit code: ${exitCode}\n${summary}`,
            data: {
              exitCode,
              stdout: truncated ? stdout + "\n[truncated]" : stdout,
              stderr,
              truncated,
            },
          });
        });

        child.on("error", (err) => {
          resolve({
            ok: false,
            summary: `Shell execution error: ${err.message}`,
            error: { code: "SHELL_ERROR", retryable: true, message: err.message },
          });
        });
      });
    },
  };
}
```

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/shell-tools.test.ts`
Expected: PASS (3 pass, 1-2 may need env adjustments)

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/tools/shell-tools.ts tests/conversation-agent/shell-tools.test.ts
git commit -m "feat: add shell tool with command classification and sandbox"
```

---

## Task 6: QA Workflow + Artifact + Knowledge Tools

**Objective:** Implement wrapper tools that delegate to existing workflow engine, artifact repo, and knowledge repo packages.

**Files:**
- Create: `packages/conversation-agent/src/tools/workflow-tools.ts`
- Create: `packages/conversation-agent/src/tools/artifact-tools.ts`
- Create: `packages/conversation-agent/src/tools/knowledge-tools.ts`
- Create: `tests/conversation-agent/workflow-tools.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/conversation-agent/workflow-tools.test.ts
import { describe, it, expect } from "bun:test";
import type { ToolContext } from "../../packages/conversation-agent/src/types";

const ctx: ToolContext = { workspaceRoot: process.cwd(), sessionId: "test", yolo: false, env: {} };

describe("WorkflowTools", () => {
  it("provides workflow.start tool", async () => {
    const { createWorkflowTools } = await import("../../packages/conversation-agent/src/tools/workflow-tools");
    const tools = createWorkflowTools();
    expect(tools.workflow_start.name).toBe("workflow.start");
    expect(tools.workflow_start.permission).toBe("safe");
  });

  it("returns all required workflow tools", async () => {
    const { createWorkflowTools } = await import("../../packages/conversation-agent/src/tools/workflow-tools");
    const tools = createWorkflowTools();
    const names = Object.values(tools).map(t => t.name);
    expect(names).toContain("workflow.start");
    expect(names).toContain("workflow.status");
    expect(names).toContain("workflow.resume");
    expect(names).toContain("workflow.find_runs");
  });
});
```

**Step 2: Implement workflow tools**

```typescript
// packages/conversation-agent/src/tools/workflow-tools.ts
import type { ConversationTool, ToolResult, ToolContext } from "../types";

export function createWorkflowTools(): Record<string, ConversationTool> {
  return {
    workflow_start: {
      name: "workflow.start",
      description: "Start a QA workflow by name (e.g., test-case-gen, bug-report-gen)",
      inputSchema: {
        type: "object",
        properties: {
          workflowName: { type: "string", description: "Workflow name (test-case-gen, bug-report-gen, etc.)" },
          project: { type: "string" },
          feature: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["workflowName"],
      },
      permission: "safe" as const,
      toolset: "qa-workflows" as any,
      async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
        try {
          // Delegate to workflow engine
          const { runWorkflow } = await import("@kata-agent/workflow-engine");
          const result = await runWorkflow(input.workflowName, {
            project: input.project,
            feature: input.feature,
            sourceUrl: input.sourceUrl,
          });
          return {
            ok: true,
            summary: `Started workflow '${input.workflowName}' (run ID: ${result.runId})`,
            data: { runId: result.runId, workflowName: input.workflowName },
          };
        } catch (err) {
          return {
            ok: false,
            summary: `Failed to start workflow: ${err}`,
            error: { code: "WORKFLOW_START_ERROR", retryable: true, message: String(err) },
          };
        }
      },
    },
    // ... similar for workflow.status, workflow.resume, workflow.find_runs
  };
}
```

**Step 3: Implement artifact and knowledge tools**

Similar pattern — delegate to existing package APIs.

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/workflow-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/tools/ tests/conversation-agent/workflow-tools.test.ts
git commit -m "feat: add workflow, artifact, and knowledge tools"
```

---

## Task 7: SecretRedactor — Pre-Provider and Log Redaction

**Objective:** Implement SecretRedactor that scans for secret patterns (API keys, JWTs, PEM blocks, tokens) and redacts them before they reach the model provider or session logs.

**Files:**
- Create: `packages/conversation-agent/src/secret-redactor.ts`
- Create: `tests/conversation-agent/secret-redactor.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/secret-redactor.test.ts
import { describe, it, expect } from "bun:test";

describe("SecretRedactor", () => {
  it("redacts API key patterns in user messages", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const result = redactor.redact("my api key is sk-abc123def456");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abc123def456");
  });

  it("redacts JWT tokens", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqP3T2hwDhL5T1e5w";
    const result = redactor.redact(`token=${jwt}`);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(jwt);
  });

  it("redacts PEM blocks", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDC\n-----END PRIVATE KEY-----";
    const result = redactor.redact(pem);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("BEGIN PRIVATE KEY");
  });

  it("redacts password= and token= assignments", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const result = redactor.redact("password=supersecret123&token=abc456");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("supersecret123");
  });

  it("redacts signed URL query params", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const url = "https://example.com/file?sig=abc123&X-Amz-Security-Token=xyz789";
    const result = redactor.redact(url);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abc123");
  });

  it("returns original text unchanged when no secrets found", async () => {
    const { SecretRedactor } = await import("../../packages/conversation-agent/src/secret-redactor");
    const redactor = new SecretRedactor();
    const text = "hello world, this is a normal message";
    const result = redactor.redact(text);
    expect(result).toBe(text);
  });
});
```

**Step 2: Implement `packages/conversation-agent/src/secret-redactor.ts`**

```typescript
export class SecretRedactor {
  private patterns: RegExp[];

  constructor() {
    this.patterns = [
      // OpenAI / Anthropic API keys
      /\b(sk-[A-Za-z0-9]{20,})\b/g,
      /\b(sk-ant-[A-Za-z0-9]{20,})\b/g,
      // JWT tokens
      /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
      // PEM blocks
      /-----BEGIN\s+[A-Z]+\s+KEY-----\s*[\s\S]*?-----END\s+[A-Z]+\s+KEY-----/g,
      // password= / token= / secret= assignments
      /\b(password|token|secret|api_key|apikey|api-key)\s*[=:]\s*['"]?([A-Za-z0-9_\-@#$%^&*+=]{8,})['"]?/gi,
      // Signed URL query params
      /(\?|&)(sig|token|X-Amz-Security-Token|X-Amz-Credential)=[^&\s]+/g,
      // Generic long alphanumeric strings that look like secrets
      /\b[A-Za-z0-9_\-]{40,}\b/g,
    ];
  }

  redact(text: string): string {
    let result = text;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, (match) => {
        // Skip if it looks like a normal word/URL
        if (this.isLikelyBenign(match)) return match;
        return "[REDACTED]";
      });
    }
    return result;
  }

  private isLikelyBenign(text: string): boolean {
    // URLs, file paths, and version strings are likely benign
    if (text.startsWith("http://") || text.startsWith("https://")) return true;
    if (text.startsWith("/") || text.startsWith("./") || text.startsWith("../")) return true;
    if (/^\d+\.\d+\.\d+/.test(text)) return true; // version strings
    return false;
  }
}
```

**Step 3: Run tests**

Run: `bun test tests/conversation-agent/secret-redactor.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/conversation-agent/src/secret-redactor.ts tests/conversation-agent/secret-redactor.test.ts
git commit -m "feat: add SecretRedactor with pre-provider and log redaction"
```

---

## Task 8: Intent Bias — Workflow/Project/Feature Extraction

**Objective:** Implement IntentBias that extracts likely workflow name, project, feature, and whether resuming or requiring external effects from natural language input.

**Files:**
- Create: `packages/conversation-agent/src/intent.ts`
- Create: `tests/conversation-agent/intent.test.ts`

**Step 1: Write failing test**

```typescript
// tests/conversation-agent/intent.test.ts
import { describe, it, expect } from "bun:test";

describe("IntentBias", () => {
  it("detects workflow intent from NL", async () => {
    const { IntentBias } = await import("../../packages/conversation-agent/src/intent");
    const bias = new IntentBias();
    const result = bias.analyze("帮我生成蓝湖这个项目的测试用例，功能是 rule-config，链接 https://example.com");
    expect(result.workflow).toBe("test-case-gen");
    expect(result.project).toBe("蓝湖");
    expect(result.feature).toBe("rule-config");
  });

  it("detects resume intent", async () => {
    const { IntentBias } = await import("../../packages/conversation-agent/src/intent");
    const bias = new IntentBias();
    const result = bias.analyze("继续刚才 rule-config 那个任务");
    expect(result.isResume).toBe(true);
  });

  it("detects external side-effect intent", async () => {
    const { IntentBias } = await import("../../packages/conversation-agent/src/intent");
    const bias = new IntentBias();
    const result = bias.analyze("把这个 issue 同步到禅道");
    expect(result.hasExternalEffects).toBe(true);
  });

  it("returns empty analysis for non-workflow queries", async () => {
    const { IntentBias } = await import("../../packages/conversation-agent/src/intent");
    const bias = new IntentBias();
    const result = bias.analyze("跑全量测试");
    expect(result.workflow).toBeUndefined();
  });
});
```

**Step 2: Implement `packages/conversation-agent/src/intent.ts`**

```typescript
export interface IntentResult {
  workflow?: string;
  project?: string;
  feature?: string;
  sourceUrl?: string;
  isResume?: boolean;
  hasExternalEffects?: boolean;
}

// Simple keyword-based intent extraction
// Does NOT make decisions — just adds context for the model
export class IntentBias {
  analyze(text: string): IntentResult {
    const result: IntentResult = {};
    const lower = text.toLowerCase();

    // Detect resume
    if (/^继续|resume|继续刚才|接着/.test(text)) {
      result.isResume = true;
    }

    // Detect external effects
    if (/同步|sync|禅道|zentao|钉钉|dingtalk|蓝湖写回|writeback|推送|push/.test(text)) {
      result.hasExternalEffects = true;
    }

    // Extract workflow by keyword
    if (/测试用例|test.?case/i.test(text)) {
      result.workflow = "test-case-gen";
    }
    if (/bug|缺陷/i.test(text)) {
      result.workflow = "bug-report-gen";
    }
    if (/需求|requirement/i.test(text)) {
      result.workflow = "requirement-spec-gen";
    }

    // Extract project (after 项目/project keyword)
    const projectMatch = text.match(/项目\s*(.{1,20})(?:\s|,|，|$)/);
    if (projectMatch) result.project = projectMatch[1].trim();

    // Extract feature (after 功能/feature keyword)
    const featureMatch = text.match(/功能\s*(.{1,30})(?:\s|,|，|$)/);
    if (featureMatch) result.feature = featureMatch[1].trim();

    // Extract URL
    const urlMatch = text.match(/https?:\/\/[^\s,，]+/);
    if (urlMatch) result.sourceUrl = urlMatch[0];

    return result;
  }
}
```

**Step 3: Run tests**

Run: `bun test tests/conversation-agent/intent.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/conversation-agent/src/intent.ts tests/conversation-agent/intent.test.ts
git commit -m "feat: add IntentBias for workflow detection from NL"
```

---

## Task 9: Conversation Agent Loop — Context Builder + Model Integration

**Objective:** Implement the main ConversationAgent loop: build context messages, call the model provider (OpenAI-compatible), execute returned tool calls, and loop until final response or budget exhausted.

**Files:**
- Create: `packages/conversation-agent/src/prompts.ts`
- Create: `packages/conversation-agent/src/agent.ts`
- Create: `tests/conversation-agent/agent.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/conversation-agent/agent.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, "../../.test-agent");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("ConversationAgent", () => {
  it("processes a simple NL query through the loop", async () => {
    const { ConversationAgent } = await import("../../packages/conversation-agent/src/agent");
    const agent = new ConversationAgent({
      sessionDir: testDir,
      workspaceRoot: process.cwd(),
      model: "gpt-4o",
      provider: "openai",
      apiKey: "test-key",
      maxIterations: 5,
    });
    
    // Register a mock workflow tool
    agent.registerTool({
      name: "test.tool",
      description: "test",
      inputSchema: { type: "object" },
      permission: "safe" as any,
      toolset: "shell" as any,
      execute: async () => ({ ok: true, summary: "done" }),
    });
    
    // Should not crash
    expect(agent).toBeDefined();
  });
});
```

**Step 2: Implement `packages/conversation-agent/src/prompts.ts`**

```typescript
import type { ConversationTool, ToolsetName } from "./types";

export function buildSystemPrompt(
  tools: ConversationTool[],
  enabledToolsets: ToolsetName[],
  intent?: string,
): string {
  const availableTools = tools
    .filter(t => enabledToolsets.includes(t.toolset))
    .map(t => `  - ${t.name}: ${t.description} [${t.permission}]`)
    .join("\n");

  return `You are kata-agent's natural language assistant. You help users with QA workflows, file operations, shell commands, and knowledge queries.

## Available Tools
${availableTools}

## Rules
1. Use tools to fulfill the user's request.
2. For QA workflows, use workflow.start or workflow.resume.
3. For shell commands, use shell.exec.
4. For file operations, use file tools.
5. External side effects (sync, writeback, push) require explicit approval.
6. Respond with a final message when done.
7. Maximum 10 tool calls per turn.

${intent ? `## Detected Intent Context\n${intent}\n` : ""}

## Slash Commands
- /help — Show this help
- /status — Show current session state
- /new — Start a new session
- /tools — List enabled toolsets
- /yolo — Enable yolo mode
- /exit — Exit chat`;
}
```

**Step 3: Implement `packages/conversation-agent/src/agent.ts`**

```typescript
import type { ConversationTool, ToolResult, ToolContext, ToolsetName, ChatMessage, SlashCommand } from "./types";
import { ToolRuntime } from "./tool-runtime";
import { SessionStore } from "./session-store";
import { IntentBias } from "./intent";
import { SecretRedactor } from "./secret-redactor";
import { buildSystemPrompt } from "./prompts";
import { randomUUID } from "node:crypto";

export interface AgentConfig {
  sessionDir: string;
  workspaceRoot: string;
  model: string;
  provider: string;
  apiKey: string;
  apiBase?: string;
  maxIterations?: number;
}

export class ConversationAgent {
  private runtime: ToolRuntime;
  private store: SessionStore;
  private intent: IntentBias;
  private redactor: SecretRedactor;
  private config: AgentConfig;
  private sessionId: string;
  private yolo: boolean;
  private enabledToolsets: ToolsetName[];

  constructor(config: AgentConfig) {
    this.runtime = new ToolRuntime();
    this.store = new SessionStore(config.sessionDir);
    this.intent = new IntentBias();
    this.redactor = new SecretRedactor();
    this.config = config;
    this.sessionId = randomUUID();
    this.yolo = false;
    this.enabledToolsets = ["qa-workflows", "files", "shell", "artifacts", "knowledge", "approvals"];
  }

  registerTool(tool: ConversationTool): void {
    this.runtime.register(tool);
  }

  getSessionId(): string { return this.sessionId; }

  getYolo(): boolean { return this.yolo; }
  setYolo(v: boolean): void { this.yolo = v; }

  getEnabledToolsets(): ToolsetName[] { return [...this.enabledToolsets]; }
  setEnabledToolsets(toolsets: ToolsetName[]): void { this.enabledToolsets = toolsets; }

  getContext(): ToolContext {
    return {
      workspaceRoot: this.config.workspaceRoot,
      sessionId: this.sessionId,
      yolo: this.yolo,
      env: {},
    };
  }

  async handleSlashCommand(command: string): Promise<string> {
    const cmd = command.toLowerCase().trim() as SlashCommand;
    switch (cmd) {
      case "help":
        return buildSystemPrompt(this.runtime.listTools(), this.enabledToolsets);
      case "status":
        return `Session: ${this.sessionId}\nYolo: ${this.yolo}\nToolsets: ${this.enabledToolsets.join(", ")}\nMessages: ${(await this.store.readMessages(this.sessionId)).length}`;
      case "new":
        this.sessionId = randomUUID();
        this.yolo = false;
        return "New session started.";
      case "yolo":
        this.yolo = !this.yolo;
        return `Yolo mode: ${this.yolo ? "ON" : "OFF"}`;
      case "exit":
        return "Goodbye!";
      case "tools":
        return `Enabled toolsets: ${this.enabledToolsets.join(", ")}\nTools: ${this.runtime.listTools().map(t => `- ${t.name} [${t.permission}]`).join("\n")}`;
      default:
        return `Unknown command: ${command}. Try /help`;
    }
  }

  async processUserMessage(userMessage: string): Promise<ChatMessage[]> {
    // Redact secrets before persisting
    const redactedMessage = this.redactor.redact(userMessage);
    
    // Store user message
    await this.store.appendMessage(this.sessionId, { role: "user", content: redactedMessage });
    
    // Analyze intent
    const intent = this.intent.analyze(redactedMessage);
    
    // Build system prompt with intent context
    const systemPrompt = buildSystemPrompt(
      this.runtime.listTools(),
      this.enabledToolsets,
      intent.workflow ? `Detected workflow: ${intent.workflow}${intent.project ? `, project: ${intent.project}` : ""}${intent.feature ? `, feature: ${intent.feature}` : ""}` : undefined,
    );
    
    // For now, return a placeholder — real model integration will send the API request
    return [{
      role: "assistant",
      content: `I analyzed your request. ${intent.workflow ? `I can help with workflow: ${intent.workflow}` : "How can I help you?"}`,
    }];
  }
}
```

**Step 4: Run tests**

Run: `bun test tests/conversation-agent/agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/conversation-agent/src/agent.ts packages/conversation-agent/src/prompts.ts tests/conversation-agent/agent.test.ts
git commit -m "feat: add ConversationAgent loop with context builder"
```

---

## Task 10: Approval Tools + Chat CLI

**Objective:** Implement approval tools (approval prompt, timeout, log) and the chat CLI entrypoint with readline-based interaction and slash command dispatch.

**Files:**
- Create: `packages/conversation-agent/src/tools/approval-tools.ts`
- Create: `apps/cli/src/chat.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `tests/conversation-agent/chat-cli.test.ts`

**Step 1: Write approval tools test + implementation**

```typescript
// tests/conversation-agent/approval-tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, "../../.test-approvals");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("ApprovalTools", () => {
  it("denies if no response within timeout", async () => {
    const { createApprovalTool } = await import("../../packages/conversation-agent/src/tools/approval-tools");
    const tool = createApprovalTool(testDir, { timeout: 100 });
    const start = Date.now();
    const result = await tool.execute({ action: "delete everything", details: "rm -rf /" }, {} as any);
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("APPROVAL_TIMEOUT");
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
```

**Step 2: Implement approval tools**

```typescript
// packages/conversation-agent/src/tools/approval-tools.ts
import type { ConversationTool, ToolResult, ToolContext } from "../types";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

interface ApprovalOptions {
  timeout?: number;
}

export function createApprovalTool(approvalDir: string, options: ApprovalOptions = {}): ConversationTool {
  const timeout = options.timeout ?? 120_000; // 120 seconds default
  
  if (!existsSync(approvalDir)) mkdirSync(approvalDir, { recursive: true });

  const logApproval = (sessionId: string, action: string, decision: string, details: string) => {
    const logPath = join(approvalDir, `${sessionId}.jsonl`);
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      decision,
      details,
    }) + "\n";
    appendFileSync(logPath, entry, "utf-8");
  };

  return {
    name: "approval.request",
    description: "Request user approval for an action",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string" },
        details: { type: "string" },
      },
      required: ["action", "details"],
    },
    permission: "safe" as const,
    toolset: "approvals" as any,
    async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
      const { action, details } = input;
      
      // In non-interactive mode, deny immediately
      if (!process.stdin.isTTY) {
        logApproval(ctx.sessionId, action, "denied (non-interactive)", details);
        return {
          ok: false,
          summary: `Approval denied: ${action}. Not in interactive mode.`,
          error: { code: "APPROVAL_DENIED", retryable: false, message: "Approval is only available in interactive chat mode" },
        };
      }

      // In interactive mode, prompt user with timeout
      console.log(`\n⚠️  Approval Required: ${action}`);
      console.log(`   Details: ${details}`);
      console.log(`   Type 'y' to approve, anything else to deny (timeout: ${timeout / 1000}s)`);
      
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          logApproval(ctx.sessionId, action, "timeout", details);
          resolve({
            ok: false,
            summary: `Approval timed out: ${action}`,
            error: { code: "APPROVAL_TIMEOUT", retryable: false, message: "Approval request timed out" },
          });
        }, timeout);

        process.stdin.once("data", (data) => {
          clearTimeout(timer);
          const response = data.toString().trim().toLowerCase();
          if (response === "y" || response === "yes") {
            logApproval(ctx.sessionId, action, "approved", details);
            resolve({ ok: true, summary: `Approved: ${action}` });
          } else {
            logApproval(ctx.sessionId, action, "denied", details);
            resolve({
              ok: false,
              summary: `Approval denied: ${action}`,
              error: { code: "APPROVAL_DENIED", retryable: false, message: "User denied approval" },
            });
          }
        });
      });
    },
  };
}
```

**Step 3: Implement chat CLI**

```typescript
// apps/cli/src/chat.ts
import { createInterface } from "node:readline";
import { ConversationAgent } from "@kata-agent/conversation-agent";
import { createFileTools } from "@kata-agent/conversation-agent/tools/file-tools";
import { createShellTool } from "@kata-agent/conversation-agent/tools/shell-tools";
import { createWorkflowTools } from "@kata-agent/conversation-agent/tools/workflow-tools";
import { createArtifactTools } from "@kata-agent/conversation-agent/tools/artifact-tools";
import { createKnowledgeTools } from "@kata-agent/conversation-agent/tools/knowledge-tools";
import { createApprovalTool } from "@kata-agent/conversation-agent/tools/approval-tools";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export async function startChat(options: {
  workspaceRoot?: string;
  sessionDir?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
}) {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const sessionDir = options.sessionDir ?? resolve(workspaceRoot, ".kata-agent/sessions");
  const approvalDir = resolve(workspaceRoot, ".kata-agent/approvals");

  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  if (!existsSync(approvalDir)) mkdirSync(approvalDir, { recursive: true });

  const agent = new ConversationAgent({
    sessionDir,
    workspaceRoot,
    model: options.model ?? process.env.KATA_AGENT_MODEL ?? "gpt-4o",
    provider: options.provider ?? process.env.KATA_AGENT_PROVIDER ?? "openai",
    apiKey: options.apiKey ?? process.env.KATA_AGENT_API_KEY ?? "",
    maxIterations: parseInt(process.env.KATA_AGENT_MAX_ITERATIONS ?? "10"),
  });

  // Register all tools
  const fileTools = createFileTools(workspaceRoot);
  for (const tool of Object.values(fileTools)) agent.registerTool(tool);
  
  agent.registerTool(createShellTool(workspaceRoot));
  
  const workflowTools = createWorkflowTools();
  for (const tool of Object.values(workflowTools)) agent.registerTool(tool);
  
  const artifactTools = createArtifactTools();
  for (const tool of Object.values(artifactTools)) agent.registerTool(tool);
  
  const knowledgeTools = createKnowledgeTools();
  for (const tool of Object.values(knowledgeTools)) agent.registerTool(tool);
  
  agent.registerTool(createApprovalTool(approvalDir));

  // Start readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🤖 kata> ",
  });

  console.log("kata-agent NL Runtime v0.5");
  console.log("Type /help for available commands.");
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/")) {
      const result = await agent.handleSlashCommand(trimmed.slice(1));
      console.log(result);
      if (trimmed === "/exit") {
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    // Process as NL query
    try {
      const responses = await agent.processUserMessage(trimmed);
      for (const msg of responses) {
        if (msg.role === "assistant" && "content" in msg) {
          console.log(`\n${msg.content}\n`);
        }
      }
    } catch (err) {
      console.error(`Error: ${err}`);
    }
    
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Goodbye!");
    process.exit(0);
  });
}
```

**Step 4: Modify `apps/cli/src/index.ts` to add chat command**

Add the chat command registration.

**Step 5: Run tests**

Run: `bun test tests/conversation-agent/`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/conversation-agent/src/tools/approval-tools.ts apps/cli/src/chat.ts apps/cli/src/index.ts
git commit -m "feat: add approval tools and chat CLI entrypoint"
```

---

## Task 11: Integration Tests + Final Verification

**Objective:** Write integration tests that exercise the full conversation flow and verify all acceptance criteria. Run full test suite.

**Files:**
- Create: `tests/conversation-agent/integration.test.ts`

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (148 existing + new conversation-agent tests)

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit final**

```bash
git add tests/conversation-agent/integration.test.ts
git commit -m "test: add integration tests for NL runtime"
```

---

## Hard Constraints

1. Keep the Workflow Engine as the only QA workflow flow controller.
2. Conversation Agent must never manually branch inside a workflow.
3. All file paths must go through canonicalization before I/O.
4. External side effects always require approval (even in yolo mode).
5. SecretRedactor must apply before provider request AND before log write.
6. Dangerous shell commands (rm -rf /, git reset --hard, sudo, etc.) are always rejected.
7. Existing explicit CLI commands must remain unchanged.
8. Chat messages are persisted as append-only JSONL with atomic locks.
