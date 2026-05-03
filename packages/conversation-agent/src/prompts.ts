// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — System prompt builder
//
// Builds a system prompt that tells the model what tools are available,
// what permissions they require, and what slash commands the user can use.
// ---------------------------------------------------------------------------

import type { ConversationTool, ToolsetName } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLASH_COMMAND_DOCS = `
## Slash 命令

可用命令：

  /help      显示本帮助（列出可用工具和命令）
  /status    显示当前会话信息（会话 ID、工具集、yolo 模式等）
  /new       开始新的会话（重置上下文和 yolo 模式）
  /title     <名称> 为当前会话命名
  /sessions  列出最近 10 个会话
  /resume    <会话ID> 恢复指定会话
  /tools     列出已启用的工具集和可用工具
  /yolo      切换 yolo 模式（开启/关闭高权限工具）
  /exit      结束当前会话
`;

const TOOL_USAGE_RULES = `
## Tool Usage Rules

- 你的角色是**任务调度官（Orchestrator）**，不是直接执行者。
- **任何需要实际操作的任务**（文件读写、代码编写、Shell 命令、项目分析、测试运行、Git 操作等）必须通过 \`codex_exec\` 工具委派给 Codex 执行。
- 委派时提供清晰的任务描述和上下文（工作区路径等）。
- 简单知识性问题可以直接回答，不需要委派。
- 当 Codex 返回结果后，整理后回复给用户。

工具权限说明：
  - safe: 始终可用
  - workspace-write: 允许（记录审计日志）
  - command: 需要 yolo 模式
  - external: 始终需要用户审批

使用 tool 时要遵守输入模式，提供合法参数。
`;

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

/**
 * Build a system prompt for the conversation agent.
 *
 * @param tools       All registered tools
 * @param enabledToolsets  Which toolsets are currently enabled
 * @param intentContext    Optional context from IntentBias analysis
 * @returns A formatted system prompt string
 */
export function buildSystemPrompt(
  tools: ConversationTool[],
  enabledToolsets: ToolsetName[],
  intentContext?: string,
): string {
  const enabledSet = new Set(enabledToolsets);
  const filteredTools = tools.filter((t) => enabledSet.has(t.toolset));

  // Organise tools by toolset for a cleaner display
  const toolsByToolset = new Map<ToolsetName, ConversationTool[]>();
  for (const tool of filteredTools) {
    const list = toolsByToolset.get(tool.toolset) ?? [];
    list.push(tool);
    toolsByToolset.set(tool.toolset, list);
  }

  const toolsetEntries = Array.from(toolsByToolset.entries());

  const lines: string[] = [];

  lines.push("# 你是 kata-agent 的任务调度官（Task Orchestrator）。");
  lines.push("");
  lines.push(
    "你负责理解用户的开发任务意图，将实际操作委派给 Codex CLI 执行。",
  );
  lines.push(
    "你的角色是：理解需求 → 制定策略 → 委派执行 → 整理结果。",
  );
  lines.push("");

  // ---- Intent Context ----------------------------------------------------
  if (intentContext) {
    lines.push("## Intent Context");
    lines.push("");
    lines.push(intentContext);
    lines.push("");
  }

  // ---- Available Tools ---------------------------------------------------
  lines.push("## Available Tools");
  lines.push("");

  if (filteredTools.length === 0) {
    lines.push("No tools are currently enabled.");
    lines.push("");
  } else {
    for (const [toolset, tsTools] of toolsetEntries) {
      lines.push(`### ${toolset}`);
      for (const t of tsTools) {
        lines.push(`  - **${t.name}**: ${t.description} (Permission: ${t.permission})`);
      }
      lines.push("");
    }
  }

  // ---- Slash Commands ----------------------------------------------------
  lines.push(SLASH_COMMAND_DOCS.trim());
  lines.push("");

  // ---- Tool Usage Rules --------------------------------------------------
  lines.push(TOOL_USAGE_RULES.trim());
  lines.push("");

  // ---- Response Guidelines -----------------------------------------------
  lines.push("## 回复守则");
  lines.push("");
  lines.push("- 回复保持清晰简洁。");
  lines.push("- 如果需要更多信息，询问用户。");
  lines.push("- 执行任务前，先简单说明你的计划。");
  lines.push("- 需要实际操作的任务 → 使用 codex_exec 委派给 Codex。");
  lines.push("- 如果 Codex 执行失败，描述错误并建议替代方案。");
  lines.push("");

  return lines.join("\n");
}
