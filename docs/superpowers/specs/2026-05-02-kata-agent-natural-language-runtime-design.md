# kata-agent Natural Language Runtime Design

> **Status:** Approved design for implementation planning
> **Date:** 2026-05-02
> **Scope:** Interactive natural-language agent runtime for kata-agent, implemented in TypeScript/Bun.

## 1. Goal

Turn kata-agent from a command-first QA workflow engine into a Hermes-like interactive agent that can be used through natural language while preserving the existing Workflow Engine, schema contracts, artifact repository, plugin runtime, and quality gates.

The first version adds a persistent chat entrypoint:

```sh
bun apps/cli/src/index.ts chat
```

Users can ask for QA workflow tasks, project/code tasks, artifact inspection, shell verification, and knowledge lookup in normal language. Existing explicit CLI commands remain unchanged for scripting and regression tests.

## 2. Product Direction

The target is not to clone hermes-agent wholesale. kata-agent keeps its own TypeScript/Bun runtime and treats QA workflows as first-class deterministic tools.

The desired behavior:

- Natural language is the primary interactive interface.
- Existing QA workflows remain the authoritative path for test generation, UI automation, static scanning, reports, issue drafts, and external writeback.
- General development tasks can use file and shell tools inside the workspace.
- Dangerous commands, external side effects, and credential-sensitive actions are approval-gated.
- Tool calls, approvals, and final responses are logged for audit without recording secret values.

## 3. Non-Goals For First Version

These are explicitly deferred:

- Messaging gateway integrations such as DingTalk, Feishu, Slack, Telegram, or WeCom.
- Cron or scheduled background jobs.
- Long-term memory, user modeling, or autonomous skill creation.
- Subagents and parallel delegated workstreams.
- Full terminal TUI with rich streaming layout.
- Replacing current explicit CLI commands.
- Rewriting kata-agent into Python or embedding hermes-agent as the runtime.

## 4. High-Level Architecture

```text
Interactive Chat CLI
  -> Conversation Agent
    -> Session Store
    -> Intent Bias / Context Builder
    -> Model Provider
    -> Tool Runtime
      -> QA Workflow Tools
      -> File Tools
      -> Shell Tools
      -> Artifact Tools
      -> Knowledge Tools
      -> Approval Tools
    -> Natural Language Response
```

The Workflow Engine stays the only controller for QA workflow state. The Conversation Agent may decide which workflow tool to call, but it does not manually branch inside a workflow or write workflow artifacts outside the Artifact Repository.

## 5. User Experience

### Start Chat

```sh
bun apps/cli/src/index.ts chat
```

The user sees a lightweight prompt and can type natural language. The chat mode supports slash commands:

```text
/help
/status
/new
/model
/tools
/yolo
/exit
```

### Example: Start Test Case Generation

User:

```text
帮我把这个蓝湖需求生成测试用例，项目 demo，功能 rule-config，链接是 https://...
```

Agent behavior:

1. Extract project, feature, source URL, and likely workflow.
2. Call `workflow.start` with `test-case-gen`.
3. Return the run id, current node, and confirmation draft path.

### Example: Continue A Task

User:

```text
继续刚才 rule-config 那个任务
```

Agent behavior:

1. Resolve current or matching session context.
2. Read workflow status.
3. Resume if the run is resumable.
4. Explain the new status and next expected human action.

### Example: General Development Task

User:

```text
跑全量测试，有失败就修
```

Agent behavior:

1. Call `shell.exec` with `bun test`.
2. If failures appear, inspect files with file tools.
3. Apply scoped edits through the write tool.
4. Re-run verification and summarize evidence.

### Example: External Side Effect

User:

```text
把这个 issue 同步到禅道
```

Agent behavior:

1. Locate or create an `IssueDraft`.
2. Before real sync, request approval.
3. If approved, call the existing issue sync path.
4. Record approval and result.

## 6. Core Modules

Add a new package:

```text
packages/conversation-agent/
  src/
    agent.ts
    session-store.ts
    tool-runtime.ts
    intent.ts
    prompts.ts
    types.ts
    tools/
      workflow-tools.ts
      artifact-tools.ts
      knowledge-tools.ts
      file-tools.ts
      shell-tools.ts
      approval-tools.ts
```

Add a chat CLI layer:

```text
apps/cli/src/chat.ts
apps/cli/src/index.ts
```

### Conversation Agent

Owns the conversational loop:

1. Load session state.
2. Build system/context messages.
3. Send model request with tool schemas.
4. Execute returned tool calls through `ToolRuntime`.
5. Append tool results.
6. Continue until the model returns a final response or iteration budget is exhausted.

The first version should use a small max-iteration budget to avoid runaway loops.

### Session Store

Persists:

- session id
- message history
- current project and feature, if known
- recent workflow runs
- enabled toolsets
- approval mode and yolo state
- last user-visible summary

Storage path:

```text
.kata-agent/sessions/{sessionId}.jsonl
```

The format is append-only JSON Lines so interrupted sessions remain inspectable.

### Tool Runtime

Registers tools, validates arguments, checks permissions, executes handlers, and formats results for the model.

Each tool declares:

```ts
interface ConversationTool {
  name: string;
  description: string;
  inputSchema: unknown;
  permission: ToolPermission;
  toolset: ToolsetName;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
```

### Intent Bias

The intent layer does not make final decisions. It adds lightweight context to the model prompt:

- likely QA workflow
- detected project / feature / source URL
- whether the user is asking for resume/status/import
- whether the request appears to require external side effects

This keeps deterministic command parsing out of the main chat loop while still biasing the model toward the safest existing workflow.

## 7. Toolsets

First version toolsets:

```text
qa-workflows
files
shell
artifacts
knowledge
external-plugins
approvals
```

Users can inspect and change enabled toolsets:

```text
/tools
/tools enable shell
/tools disable shell
```

### QA Workflow Tools

Required tools:

- `workflow.start`
- `workflow.status`
- `workflow.resume`
- `workflow.import_confirmation`
- `workflow.find_runs`

These wrap current workflow and CLI logic instead of shelling out to the CLI when a direct package API exists.

### Artifact Tools

Required tools:

- `artifact.list`
- `artifact.read`
- `artifact.summarize`

Artifacts must be read through the artifact index when possible. Raw path reads are allowed only inside the workspace and should clearly tell the model when a file is not an indexed artifact.

### Knowledge Tools

Required tools:

- `knowledge.search`
- `knowledge.suggestions`
- `knowledge.accept`
- `knowledge.reject`

Accept/reject mutates knowledge state and is therefore logged.

### File Tools

Required tools:

- `file.list`
- `file.read`
- `file.write`
- `file.apply_patch`

Writes are limited to the repository workspace unless the user explicitly launches chat from a different approved root in a future version.

### Shell Tools

Required tool:

- `shell.exec`

The shell tool supports ordinary development commands and captures stdout, stderr, exit code, and duration. Long output is summarized before it is sent back into the model context.

## 8. Model Interface

Use the existing provider abstraction where possible. The first version supports two execution modes:

1. Native tool calling when the selected OpenAI-compatible provider supports tool schemas.
2. JSON action fallback when tool calling is unavailable.

The fallback asks the model to return one of:

```json
{ "type": "tool_call", "tool": "workflow.status", "args": {} }
```

or:

```json
{ "type": "final", "message": "..." }
```

Invalid JSON or invalid tool arguments are returned to the model as structured errors once. Repeated invalid actions end the turn with a clear user-facing explanation.

## 9. Permission Model

Permissions mirror the Hermes-like personal-agent trust model.

```text
safe
  Read-only tools: list/read files, list/read artifacts, workflow status, knowledge search.

workspace-write
  Writes inside the kata-agent workspace, generated artifacts, docs, and code edits.

command
  Shell execution.

external
  Real network calls, DingTalk delivery, Zentao sync, Lanhu writeback, git push, or other external state changes.
```

Default behavior:

- `safe`: execute without approval.
- `workspace-write`: execute in the workspace and log the write.
- `command`: execute normal development commands; request approval for dangerous commands.
- `external`: always request approval.

Dangerous shell commands include destructive file operations, force git operations, privilege escalation, writes outside the workspace, and commands that expose secrets.

### Yolo Mode

`/yolo` enables a session-local relaxed approval mode. It skips most dangerous-command prompts, but it must not skip approval for:

- external system writes
- credential printing
- deleting the repository
- `git reset --hard`
- force pushing

Yolo state is stored in the session log and resets for new sessions unless explicitly re-enabled.

## 10. Audit And Secret Handling

Audit files:

```text
.kata-agent/sessions/{sessionId}.jsonl
.kata-agent/approvals/{sessionId}.jsonl
```

Records include:

- user messages
- assistant final responses
- tool call names and redacted arguments
- tool results, summarized when large
- approval prompts and decisions
- errors

Secret handling rules:

- Never store resolved secret values in session or approval logs.
- Never include secret values in model-visible tool results.
- When a tool needs a secret, it receives it from config at execution time.
- Error messages must not echo credentials, cookies, tokens, or signed URLs.

## 11. Error Handling

Errors are returned in a consistent shape:

```ts
interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: {
    code: string;
    retryable: boolean;
    message: string;
  };
}
```

The Conversation Agent should distinguish:

- user-action-needed errors, such as missing confirmation JSON
- retryable provider or plugin failures
- permission-denied results
- schema validation failures
- fatal workflow failures

When a workflow reaches a human gate, the agent must explain the exact artifact the user should review and the expected next input.

## 12. Testing Strategy

### Unit Tests

- session append/read behavior
- tool registry and schema validation
- approval policy classification
- intent bias extraction
- output redaction

### Contract Tests

- every conversation tool has a valid schema
- permission level is declared for every tool
- tool errors use the common `ToolResult` shape
- unsafe commands require approval by default

### Integration Tests

Natural-language test cases with mock provider responses:

- start `test-case-gen`
- import confirmation and resume
- read confirmation draft artifact
- run `bun test` through `shell.exec`
- reject real external write without approval

### CLI Smoke Tests

- `chat` starts and exits cleanly
- `/help`, `/status`, `/tools`, `/new`, `/exit` work
- existing explicit CLI commands still pass current tests

Full verification remains:

```sh
bun test
bun run typecheck
git diff --check
```

## 13. First Version Acceptance Criteria

The implementation is complete when:

1. `bun apps/cli/src/index.ts chat` starts an interactive session.
2. Natural language can start a mock `test-case-gen` workflow and report run id/current node.
3. Natural language can resume a known run.
4. Natural language can read and summarize an indexed artifact.
5. Natural language can run `bun test` through the shell tool and summarize the result.
6. External side-effect tools require explicit approval.
7. Session and approval logs are written with secret redaction.
8. Existing explicit CLI behavior remains unchanged.
9. Full verification passes.

## 14. Future Extensions

After the first version:

- messaging gateway adapters
- richer TUI
- scheduled automations
- long-term memory and knowledge nudges
- subagents
- MCP integration
- reusable natural-language skill packs
- multimodal artifact review
