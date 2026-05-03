// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Codex Exec Tool
//
// Delegates task execution to OpenAI Codex CLI. kata-agent acts as an
// orchestrator: it understands the user intent, then delegates the actual
// coding/execution work to Codex via this tool.
// ---------------------------------------------------------------------------

import { spawnSync } from "child_process";
import type { ConversationTool, ToolContext, ToolResult } from "../types";

// ---------------------------------------------------------------------------
// CodexExecTool
// ---------------------------------------------------------------------------

export function createCodexExecTool(): ConversationTool {
  return {
    name: "codex_exec",
    description:
      "将任务委派给 Codex CLI 执行。Codex 擅长代码编写、文件操作、Shell 命令、项目分析等所有开发任务。传入清晰的任务描述，Codex 会自主完成。",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "要委派给 Codex 执行的任务描述。应包含工作区路径和上下文。",
        },
        timeout: {
          type: "number",
          description: "最大执行时间（秒），默认 180",
          default: 180,
        },
      },
      required: ["task"],
    },
    permission: "safe",
    toolset: "delegation",
    async execute(
      input: Record<string, unknown>,
      context: ToolContext,
    ): Promise<ToolResult> {
      const task = String(input.task ?? "");
      const timeout = Number(input.timeout ?? 180);

      if (!task.trim()) {
        return {
          ok: false,
          summary: "任务描述为空，请提供需要 Codex 执行的任务。",
          error: {
            code: "INVALID_INPUT",
            retryable: false,
            message: "task parameter is empty",
          },
        };
      }

      // Delegate to Codex CLI via spawnSync (avoids stdin piping issues)
      try {
        const startTime = Date.now();

        const child = spawnSync("codex", [
          "exec",
          "--yolo",
          "-c", 'model="gpt-5.5"',
          "-",  // read prompt from stdin
        ], {
          cwd: context.workspaceRoot,
          timeout: timeout * 1000,
          maxBuffer: 50 * 1024 * 1024,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          input: task,
          env: {
            ...process.env,
          },
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const stdout = typeof child.stdout === "string" ? child.stdout : "";
        const stderr = typeof child.stderr === "string" ? child.stderr : "";

        if (child.error || child.signal) {
          const output = cleanupCodexOutput(stderr || stdout);
          const reason = child.error
            ? child.error.message
            : `SIG${child.signal}`;

          // 检测常见错误模式
          const isNetworkIssue = output.includes("Reconnecting") || reason.includes("ETIMEDOUT") || reason.includes("ECONNREFUSED");
          const userMessage = isNetworkIssue
            ? "Codex 无法连接到 AI 服务，请检查网络连接和 API 服务状态后重试。"
            : `Codex 执行失败（${reason}）`;

          return {
            ok: false,
            summary: `${userMessage}：${output || "无输出"}`,
            error: {
              code: isNetworkIssue ? "NETWORK_ERROR" : "EXECUTION_ERROR",
              retryable: true,
              message: `Codex ${reason}: ${output.slice(0, 200)}`,
            },
          };
        }

        if (child.status !== 0) {
          const output = cleanupCodexOutput(stderr || stdout);
          return {
            ok: false,
            summary: `Codex 执行失败（退出码 ${child.status}）：${output || "无输出"}`,
            error: {
              code: "EXECUTION_ERROR",
              retryable: true,
              message: `Exit code ${child.status}: ${output.slice(0, 200)}`,
            },
          };
        }

        const output = cleanupCodexOutput(stdout || stderr);
        return {
          ok: true,
          summary: `Codex 执行完成（${elapsed}s）：\n${output}`,
          data: { elapsed: `${elapsed}s`, output },
        };
      } catch (err: unknown) {
        if (err instanceof Error && "stderr" in err) {
          const stderr = (err as any).stderr as string;
          const stdout = (err as any).stdout as string;
          const output = cleanupCodexOutput(stdout || stderr);
          return {
            ok: false,
            summary: `Codex 执行失败：${output || err.message}`,
            error: {
              code: "EXECUTION_ERROR",
              retryable: true,
              message: err.message,
            },
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Codex 执行异常：${message}`,
          error: {
            code: "EXECUTION_ERROR",
            retryable: true,
            message,
          },
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanupCodexOutput(output: string): string {
  const lines = output.split("\n").filter((line) => {
    const trimmed = line.trim();
    // Skip Codex header/banner
    if (trimmed.startsWith("OpenAI Codex v")) return false;
    if (trimmed.startsWith("---")) return false;
    if (trimmed.startsWith("workdir:")) return false;
    if (trimmed.startsWith("model:")) return false;
    if (trimmed.startsWith("provider:")) return false;
    if (trimmed.startsWith("approval:")) return false;
    if (trimmed.startsWith("sandbox:")) return false;
    if (trimmed.startsWith("reasoning")) return false;
    if (trimmed.startsWith("session")) return false;
    if (trimmed.startsWith("--------")) return false;
    return true;
  });
  return lines.join("\n").trim();
}
