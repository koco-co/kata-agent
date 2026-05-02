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

**Concurrency control:**

- **Atomic lock file:** Each session file has a companion lock file at `.kata-agent/sessions/{sessionId}.lock`. The lock is acquired via `O_CREAT | O_EXCL` (atomic on all target platforms) and contains the PID and timestamp of the holder.
- **Stale-lock recovery:** If a lock file exists but the recorded PID is no longer running, or the lock is older than 30 seconds, the lock is considered stale and is forcibly removed before acquisition. This handles crashes and SIGKILL scenarios.
- **JSONL append locking:** Every append to the session JSONL file acquires the lock, writes the line with a single `write` syscall (atomic on POSIX for payloads under `PIPE_BUF`), then releases the lock. This prevents interleaved writes from concurrent tool executions within the same turn.
- **Approval log locking:** The approval JSONL file uses the same lock-per-file pattern.

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

**Path canonicalization (applies to all path-bearing tools):**

Every file path received by any tool is validated before any I/O operation. Two strategies are used depending on whether the target file must already exist:

- **Existing files** (`file.read`, `artifact.read` raw path, `file.list` entry targets): Resolve through `fs.realpath` to obtain the absolute, symlink-free canonical path. The resolved path must start with the resolved workspace root followed by a path separator (`/`), preventing `startsWith` false positives on sibling directories (e.g., workspace `/tmp/proj` must not match `/tmp/project`).
- **New files** (`file.write`, `file.apply_patch` targets that may not exist yet): Resolve through `path.resolve(workspaceRoot, userInput)` to collapse `..` and `.` segments, then verify the resolved path starts with the resolved workspace root + `/`. `fs.realpath` is not used because the file does not exist yet; instead, each parent directory in the path is resolved via `fs.realpath` to ensure no symlink component escapes the workspace.

A path is rejected if:
- It contains `..` segments that resolve outside the workspace after `path.resolve`.
- It is an absolute path outside the workspace.
- It starts with `~` (home directory expansion).
- Any symlink component in an existing-parent chain points outside the workspace.

This check applies to:

- `file.read` / `file.write` / `file.apply_patch` — already covered above.
- `artifact.read` when used with a raw path (not an indexed artifact id).
- `shell.exec` — any argument that looks like a filesystem path (`/...`, `./...`, `../...`) is canonicalized and rejected if it escapes the workspace. The sandbox filesystem isolation (Section 7) provides a second layer of defense.
- Session directory override (`KATA_AGENT_SESSION_DIR`) — resolved at startup and must canonicalize to a path inside the workspace or the explicit config value. A symlink pointing outside the workspace is rejected with a fatal config error.

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

**Path Safety:**

- All file paths are resolved to absolute paths and checked against the workspace root before any I/O. Symlink targets are resolved and must also fall inside the workspace.
- Path traversal attempts (`../`, `~`, absolute paths outside workspace) are rejected with a clear error and logged.
- `file.read` and `file.write` enforce a per-file size limit of 2 MB. Files above this limit return a truncation notice and suggest using `artifact.read` for indexed artifacts.
- Binary files are detected by extension and first-byte heuristics; binary reads return a refusal rather than garbled text into the model context.

### Shell Tools

Required tool:

- `shell.exec`

The shell tool supports ordinary development commands and captures stdout, stderr, exit code, and duration. Long output is summarized before it is sent back into the model context.

**Command Safety Classification:**

```text
allowed         Safe development commands: ls, cat, head, tail, grep, find, git status, git log, git diff,
                bun test, bun run typecheck, npm/pnpm scripts declared in package.json.

review          Commands that change state but stay in workspace: git add, git commit, cp, mv, mkdir,
                touch, sed within workspace, bun install.

dangerous       Commands that require explicit approval regardless of yolo mode (see Section 9):
                rm -rf, git reset --hard, git push --force, sudo, chmod 777, curl | sh, eval,
                commands targeting paths outside the workspace, commands containing $() or backtick
                substitution with untrusted input.
```

**Shell Sandbox Confinement:**

All shell commands execute inside a sandboxed subprocess with the following restrictions:

- **argv-only execution:** Commands are split into argv arrays and passed to `execvp`-family spawn. Shell metacharacters (`;`, `|`, `&&`, `||`, `$()`, backticks) are rejected unless the entire command is explicitly allowlisted. The agent never passes raw user text to `sh -c`.
- **Filesystem isolation:** The subprocess receives a read-only bind of `/usr`, `/bin`, `/lib`, and `/tmp` (tmpfs, 100 MB cap). The workspace directory is mounted read-write. All other host paths are inaccessible. `pivot_root` or `chroot` is used when the platform supports it; otherwise `landlock` (Linux) or `sandbox-exec` (macOS) profiles restrict `openat` to allowed prefixes.
- **Network isolation:** Outbound network is denied by default. Only tools classified as `external` may enable outbound sockets, and only to an allowlist of hostnames derived from the plugin configuration.
- **Process-group management:** Each sandboxed command runs in its own process group (`setpgid`). The parent sends `SIGTERM` to the group on timeout, waits 5 seconds, then sends `SIGKILL`. Orphaned child processes are reaped on session cleanup.
- **Memory cap:** The subprocess virtual memory is limited to 512 MB via `setrlimit(RLIMIT_AS)`. Exceeding the cap produces an OOM error in the tool result.
- **Output cap:** Stdout and stderr are piped through a size-limited reader that caps at 50 KB (matching the truncation rule below). Excess bytes are discarded and a `[truncated]` marker is appended.

**Shell Output Safety:**

- Stdout and stderr are truncated to 50 KB before model injection. A note is appended when truncation occurs.
- Environment variables are not leaked into tool results. The shell environment is constructed from a curated allowlist; credentials are injected only for explicit external-plugin calls and are never echoed in output.

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

`/yolo` enables a session-local relaxed approval mode. It upgrades `command`-classified tools to auto-approve, but every tool classified as `dangerous` in Section 7 **always** requires explicit approval regardless of yolo state. The non-skippable list is:

- external system writes
- credential printing
- deleting the repository
- `git reset --hard`
- force pushing
- any command matching the `dangerous` classification in Section 7

This means yolo only affects `review`-level commands. `dangerous` commands are never auto-approved.

Yolo state is stored in the session log and resets for new sessions unless explicitly re-enabled.

### Approval Timeout

Approval prompts have a default timeout of 120 seconds in interactive mode. If the user does not respond, the action is denied and a timeout entry is recorded in the approval log. In non-interactive or piped mode, approvals are denied immediately unless pre-authorized through configuration.

### Session Limits

- Maximum message history length: 200 messages. Older messages are summarized and archived to `.kata-agent/sessions/{sessionId}.archive.jsonl`.
- Maximum session file size: 5 MB. When exceeded, the oldest messages are pruned with a summary retained.
- Maximum concurrent sessions per user: 1. Starting a new session while one is active prompts for confirmation.

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

**Redaction coverage (applied before any data leaves the tool boundary):**

| Source | What is redacted | How |
|---|---|---|
| User-pasted text (session log) | Strings matching common secret patterns (API keys, JWTs, PEM blocks, `password=...`, `token=...`) | Pattern scan on user message before appending to session log; replace with `[REDACTED]` |
| User-pasted text (model provider) | Same patterns as above | Redact secrets from user messages **before** sending to the model provider. The model never sees raw user-pasted secrets. The redacted copy is what appears in both the model context and the session log. |
| File reads | Secrets found in `.env`, `credentials.json`, or any file containing key-value pairs with secret-like keys | Post-read scan; model sees the redacted version, raw content is discarded |
| Shell stdout/stderr | Secrets that appear in command output (env dumps, config prints, curl responses) | Regex scan against the curated secret pattern set before model injection |
| Provider error messages | API keys, auth tokens, or request bodies echoed by the LLM provider | Strip anything matching `[A-Za-z0-9_\-]{20,}` that also appears in the configured secret set |
| Signed URLs | Query parameters containing signatures, tokens, or expiry values (`sig=`, `token=`, `X-Amz-Security-Token`) | Redact query parameter values while preserving the URL structure so the model can still reason about the endpoint |

**Pre-provider redaction rule:** User messages are scanned by `SecretRedactor` before the model provider request is built. If a secret pattern is detected, the message is rewritten with `[REDACTED]` placeholders in-place. This redacted version is the only one that enters the model context window and the session log. The original unredacted text is never persisted or transmitted. This prevents the model from memorizing or echoing secrets, and prevents them from appearing in provider-side logs or training data.

A single `SecretRedactor` class owns all patterns and is invoked by every tool result path, the session logger, and the approval logger.

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

## 12. Rate Limiting And Resource Guards

### Tool Call Budgets

```text
Per-turn iteration limit:     10 tool calls before the agent must produce a final response or ask for continuation.
Per-session tool call limit:  200 tool calls. After this, the session requires explicit continuation.
Shell command timeout:        120 seconds. Long-running commands are killed and the result is recorded.
Model request timeout:        60 seconds per provider call. Retries up to 2 times on transient errors.
```

**Validation:**

- `KATA_AGENT_MAX_ITERATIONS` is clamped to the range [1, 50]. Values below 1 are set to 1; values above 50 are set to 50. A warning is logged when clamping occurs.
- `Per-session tool call limit` is fixed at 200 and is not configurable, to prevent runaway sessions from misconfiguration.

**Batch counting:**

- When the model returns multiple tool calls in a single response (parallel tool use), each tool call counts as one iteration against the per-turn limit. A response with 3 parallel tool calls consumes 3 iterations.
- Retried tool calls (due to transient provider errors) do not count against the iteration budget. Only successful dispatches and explicit tool errors count.

### Prompt Injection Defense

- User messages and tool results are wrapped in delimiters (`<user_message>`, `<tool_result>`) in the model prompt so the model can distinguish instructions from data.
- Tool results that contain patterns resembling system instructions (e.g., "ignore previous instructions", "you are now") are flagged in the audit log. The model is not re-prompted, but the flag enables post-hoc review.
- The system prompt is immutable within a session. User messages cannot override the safety rules, permission model, or tool definitions.

## 13. Configuration

Runtime behavior is controlled through environment variables and a config file:

```text
KATA_AGENT_MODEL              Model identifier (default: provider-specific)
KATA_AGENT_PROVIDER           Provider name: openai, anthropic, ollama, or custom
KATA_AGENT_API_KEY            API key for the selected provider (never logged)
KATA_AGENT_API_BASE           Override base URL for OpenAI-compatible providers
KATA_AGENT_SESSION_DIR        Override session storage path (default: .kata-agent/sessions)
KATA_AGENT_YOLO               Set to "true" to start in yolo mode (still logged)
KATA_AGENT_SHELL_TIMEOUT      Shell command timeout in seconds (default: 120)
KATA_AGENT_MAX_ITERATIONS     Per-turn tool call budget (default: 10)
```

Config file location: `.kata-agent/config.yaml`. Environment variables take precedence over config file values.

## 14. Data Retention

- Session logs older than 30 days are eligible for archival. Archival compresses and moves files to `.kata-agent/archive/`.
- Approval logs are retained for 90 days minimum and are never auto-deleted.
- The user can manually delete any session with `/delete-session <id>`.
- No session data is transmitted externally. All logs are local to the workspace.

## 15. Testing Strategy

### Unit Tests

- session append/read behavior
- tool registry and schema validation
- approval policy classification
- intent bias extraction
- output redaction
- path traversal rejection for file tools
- path canonicalization for artifact raw reads, shell path arguments, and session dir override
- path canonicalization rejects sibling-directory false positives (e.g., workspace `/tmp/proj` must not allow `/tmp/project/evil`)
- path canonicalization for new files: parent directory symlinks escaping workspace are rejected
- shell output truncation at 50 KB
- environment variable leakage prevention
- command safety classification (allowed / review / dangerous)
- prompt injection pattern detection in tool results
- session size and message count limit enforcement
- per-turn iteration budget enforcement (including parallel tool call counting and retry exclusion)
- iteration budget clamping to [1, 50] range
- approval timeout behavior
- shell sandbox: argv-only execution rejects metacharacters
- shell sandbox: filesystem isolation blocks reads outside workspace
- shell sandbox: network isolation blocks outbound by default
- shell sandbox: process-group timeout kills child tree
- shell sandbox: memory cap triggers OOM error
- session lock: atomic acquisition and release
- session lock: stale-lock recovery when PID is dead
- session lock: JSONL append is not interleaved under concurrent writes
- secret redaction: user-pasted API keys are masked in session log
- secret redaction: user-pasted secrets are redacted before being sent to the model provider
- secret redaction: secrets from file reads are masked before model injection
- secret redaction: shell stdout secrets are masked
- secret redaction: provider error echoes are stripped
- secret redaction: signed URL query params are redacted

### Contract Tests

- every conversation tool has a valid schema
- permission level is declared for every tool
- dangerous commands require approval even in yolo mode
- tool errors use the common `ToolResult` shape
- unsafe commands require approval by default

### Integration Tests

Natural-language test cases with mock provider responses:

- start `test-case-gen`
- import confirmation and resume
- read confirmation draft artifact
- run `bun test` through `shell.exec`
- reject real external write without approval
- reject file read outside workspace (path traversal)
- reject file read via sibling-directory `startsWith` bypass (e.g., workspace `/tmp/proj`, attempt `/tmp/project/evil`)
- reject file write to new file whose parent symlink escapes workspace
- reject artifact raw read outside workspace
- reject shell path argument outside workspace
- reject `rm -rf /` through shell even in yolo mode
- reject `git reset --hard` in yolo mode (dangerous classification)
- shell sandbox blocks network access for non-external tools
- shell sandbox kills process tree on timeout
- session archival when message count exceeds 200
- per-turn iteration budget forces final response after 10 tool calls
- parallel tool calls each count against iteration budget
- approval timeout denies action after 120 seconds of inactivity
- prompt injection payload in user message does not alter tool behavior
- user-pasted secret does not appear in session log file
- user-pasted secret is redacted before model provider request (verify via mock provider capture)
- concurrent session writes do not corrupt JSONL

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

## 16. First Version Acceptance Criteria

The implementation is complete when:

1. `bun apps/cli/src/index.ts chat` starts an interactive session.
2. Natural language can start a mock `test-case-gen` workflow and report run id/current node.
3. Natural language can resume a known run.
4. Natural language can read and summarize an indexed artifact.
5. Natural language can run `bun test` through the shell tool and summarize the result.
6. External side-effect tools require explicit approval.
7. Session and approval logs are written with secret redaction covering user-pasted secrets, file-read secrets, shell output, provider errors, and signed URLs. User-pasted secrets are redacted before being sent to the model provider, not only in logs.
8. Existing explicit CLI behavior remains unchanged.
9. Full verification passes.
10. File tools reject path traversal attempts with a clear error.
11. Path canonicalization is enforced for artifact raw reads, shell path arguments, and session dir override. New-file writes use `path.resolve` + parent-directory `fs.realpath` to prevent symlink escapes. `startsWith` checks use workspace root + `/` to prevent sibling-directory false positives.
12. Shell tools reject dangerous commands even in yolo mode.
13. Shell sandbox enforces argv-only execution, filesystem/network isolation, process-group management, memory cap, and output cap.
14. Per-turn iteration budget prevents runaway tool-call loops; parallel calls each count as one iteration.
15. `KATA_AGENT_MAX_ITERATIONS` is clamped to [1, 50].
16. Shell output is truncated and environment variables are not leaked into tool results.
17. Session JSONL appends are protected by atomic locks with stale-lock recovery.

## 17. Future Extensions

After the first version:

- messaging gateway adapters
- richer TUI
- scheduled automations
- long-term memory and knowledge nudges
- subagents
- MCP integration
- reusable natural-language skill packs
- multimodal artifact review
