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
## Slash Commands

You can use the following slash commands at any time:

  /help      Show this help message (list available tools and commands)
  /status    Show current session info (session ID, enabled toolsets, yolo mode)
  /new       Start a new conversation session (resets context and yolo mode)
  /tools     List enabled toolsets and the tools available in each
  /yolo      Toggle yolo mode (enables/disables higher-permission tools)
  /exit      End the current conversation session
`;

const TOOL_USAGE_RULES = `
## Tool Usage Rules

- Use tools only when necessary to accomplish the user's goal.
- When you use a tool, explain what you're doing and why.
- Tools have permission levels that gate what they can do:
  - safe: Always allowed
  - workspace-write: Allowed (logged for audit)
  - command: Requires yolo mode (user approval)
  - external: Always requires explicit user approval
- Respect the tool's input schema and provide valid arguments.
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

  lines.push("# You are an AI assistant for the kata-agent development platform.");
  lines.push("");
  lines.push(
    "You help users with software development tasks such as generating test cases,",
  );
  lines.push(
    "writing code, creating bug reports, managing requirements, and more.",
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
  lines.push("## Response Guidelines");
  lines.push("");
  lines.push("- Keep responses clear and concise.");
  lines.push("- If you need more information, ask the user.");
  lines.push("- When executing a task, explain your approach first.");
  lines.push("- Use the available tools to gather information or perform actions.");
  lines.push("- If a tool fails, describe the error and suggest alternatives.");
  lines.push("");

  return lines.join("\n");
}
