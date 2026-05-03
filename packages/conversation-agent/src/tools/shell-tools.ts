// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Shell tool (shell.exec) with command
// safety classification (allowed / review / dangerous), output truncation
// at 50 KB, and 120s timeout.
// ---------------------------------------------------------------------------
import { spawn } from "node:child_process";
import type { ConversationTool, ToolResult, ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB
const MAX_TIMEOUT_MS = 120_000; // 120 seconds
const TRUNCATION_MARKER = "[truncated]";

// ---------------------------------------------------------------------------
// Command classification types
// ---------------------------------------------------------------------------

type CommandClass = "allowed" | "review" | "dangerous";

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

/**
 * Normalise a command string for classification: trim whitespace and lower-case.
 */
function normalise(command: string): string {
  return command.trim().toLowerCase();
}

/**
 * Regex patterns for commands classified as **dangerous**.
 * These are ALWAYS rejected regardless of yolo mode.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // rm -rf / or rm -rf /* (delete root filesystem)
  /\brm\s+(-rf|-\w*r\w*f\w*|-\w*f\w*r\w*)\s+\//,
  // rm -rf ~ (delete home directory)
  /\brm\s+(-rf|-\w*r\w*f\w*|-\w*f\w*r\w*)\s+~/,
  // rm -rf * or rm -rf . (delete all in current directory)
  /\brm\s+(-rf|-\w*r\w*f\w*|-\w*f\w*r\w*)\s+[*.]\s*$/,
  // sudo — privilege escalation
  /\bsudo\b/,
  // chmod 777 (or chmod -R 777, chmod 777 /path)
  /\bchmod\s+(-R\s+)?777\b/,
  // curl|wget piped to sh/bash
  /\b(curl|wget)\s+.+\|\s*(sh|bash)\b/,
  // git reset --hard (destructive git)
  /\bgit\s+reset\s+--hard\b/,
  // git push --force or git push -f (force push)
  /\bgit\s+push\s+(--force|-f)\b/,
  // eval — arbitrary code execution
  /\beval\b/,
  // dd — destructive disk writes (e.g. dd if=... of=/dev/...)
  /\bdd\s+if=.*\s+of=\/dev\//,
  // mkfs / mke2fs / mkfs.* — filesystem creation on devices
  /\bmkfs\b/,
  /\bmke2fs\b/,
];

/**
 * Check if a command contains shell substitution patterns (`$(...)` or
 * backtick `` `...` ``) that could be dangerous when the input originates
 * from a user. We only flag these if the command itself (the outer command)
 * is not trivially read-only.
 */
function hasUserSubstitution(command: string): boolean {
  // Look for command substitution via $() or backticks
  return /\$\(/.test(command) || /`[^`]+`/.test(command);
}

/**
 * Regex patterns for commands classified as **allowed** (execute without
 * approval). These are safe, read-only, or well-known dev commands.
 */
const ALLOWED_PATTERNS: RegExp[] = [
  // Basic read-only commands
  /^ls\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^grep\b/,
  /^find\b/,
  /^echo\b/,
  /^pwd\b/,
  /^which\b/,
  // Read-only git commands
  /^git\s+status\b/,
  /^git\s+log\b/,
  /^git\s+diff\b/,
  // Development commands
  /^bun\s+test\b/,
  /^bun\s+run\s+typecheck\b/,
  /^npm\s+test\b/,
  /^npm\s+run\b/,
];

/**
 * Classify a command string into one of three safety levels.
 *
 * Order of checks:
 * 1. **Dangerous** — always rejected, even in yolo mode
 * 2. **Allowed** — executed without approval
 * 3. **Review** — everything else (approval-gated by ToolRuntime)
 */
function classifyCommand(command: string): CommandClass {
  const normalised = normalise(command);

  // 1. Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(normalised)) {
      return "dangerous";
    }
  }

  // Check for command substitution (dangerous when user input is involved)
  if (hasUserSubstitution(command)) {
    return "dangerous";
  }

  // 2. Check allowed patterns
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(normalised)) {
      return "allowed";
    }
  }

  // 3. Default to review
  return "review";
}

// ---------------------------------------------------------------------------
// Output truncation
// ---------------------------------------------------------------------------

/**
 * Truncate a string to `maxBytes` bytes (UTF-8 aware). Appends
 * `TRUNCATION_MARKER` when the string exceeds the limit.
 */
function truncateOutput(output: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(output);
  if (encoded.length <= maxBytes) {
    return output;
  }

  // Find the byte boundary that fits within maxBytes, respecting
  // multi-byte UTF-8 character boundaries.
  const truncated = new TextDecoder("utf-8", { fatal: false }).decode(
    encoded.slice(0, maxBytes),
  );

  return truncated + TRUNCATION_MARKER;
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * Result from executing a shell command.
 */
interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a command via the system shell with a timeout and output limit.
 *
 * Uses `/bin/sh -c` to support pipes, redirects, and compound commands.
 * Environment is minimal (PATH, HOME) to avoid credential leakage.
 */
function executeCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const child = spawn("/bin/sh", ["-c", command], {
      cwd,
      signal: controller.signal,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/root",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    function collectStdout(chunk: Buffer) {
      const remaining = MAX_OUTPUT_BYTES - stdoutLength;
      if (remaining <= 0) {
        stdoutTruncated = true;
        return;
      }
      const slice = chunk.slice(0, remaining);
      stdoutChunks.push(slice);
      stdoutLength += slice.length;
      if (slice.length < chunk.length) {
        stdoutTruncated = true;
      }
    }

    function collectStderr(chunk: Buffer) {
      const remaining = MAX_OUTPUT_BYTES - stderrLength;
      if (remaining <= 0) {
        stderrTruncated = true;
        return;
      }
      const slice = chunk.slice(0, remaining);
      stderrChunks.push(slice);
      stderrLength += slice.length;
      if (slice.length < chunk.length) {
        stderrTruncated = true;
      }
    }

    if (child.stdout) {
      child.stdout.on("data", collectStdout);
    }
    if (child.stderr) {
      child.stderr.on("data", collectStderr);
    }

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
      } else {
        reject(err);
      }
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);

      let stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      let stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (stdoutTruncated) {
        stdout += TRUNCATION_MARKER;
      }
      if (stderrTruncated) {
        stderr += TRUNCATION_MARKER;
      }

      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Create the `shell.exec` tool bound to the given `workspaceRoot`.
 *
 * The tool classifies commands into three levels:
 * - **allowed**: executed immediately
 * - **review**: routed to ToolRuntime for approval when not in yolo mode
 * - **dangerous**: always rejected (returns DANGEROUS_COMMAND error)
 *
 * Output is capped at 50 KB; execution times out at 120 seconds.
 */
export function createShellTool(
  workspaceRoot: string,
): ConversationTool {
  const shellTool: ConversationTool = {
    name: "shell_exec",
    description:
      "Execute a shell command inside the workspace. " +
      "Commands are classified as allowed (read-only, dev commands), " +
      "review (modifying workspace, package operations), or dangerous " +
      "(always rejected). Output truncated at 50 KB, timeout at 120s.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Shell command to execute. Use standard shell syntax " +
            "(pipes, redirects, compound commands).",
        },
      },
      required: ["command"],
    },
    permission: "command",
    toolset: "shell",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const command = String(input.command ?? "").trim();

      if (!command) {
        return {
          ok: false,
          summary: "No command provided",
          error: {
            code: "INVALID_INPUT",
            retryable: false,
            message: "The 'command' parameter is required and cannot be empty.",
          },
        };
      }

      // ---- Command classification ----
      const classification = classifyCommand(command);

      if (classification === "dangerous") {
        return {
          ok: false,
          summary: `Command classified as dangerous: "${command}"`,
          error: {
            code: "DANGEROUS_COMMAND",
            retryable: false,
            message:
              `The command "${command}" is classified as dangerous and ` +
              "cannot be executed.",
          },
        };
      }

      // ---- Execute ----
      try {
        const result = await executeCommand(
          command,
          workspaceRoot,
          MAX_TIMEOUT_MS,
        );

        return {
          ok: true,
          summary: `Command completed with exit code ${result.exitCode}`,
          data: {
            exitCode: result.exitCode,
            stdout: truncateOutput(result.stdout, MAX_OUTPUT_BYTES),
            stderr: truncateOutput(result.stderr, MAX_OUTPUT_BYTES),
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Command failed: ${msg}`,
          error: {
            code: "EXECUTION_ERROR",
            retryable: true,
            message: msg,
          },
        };
      }
    },
  };

  return shellTool;
}
