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
    return (
      await input.executeTool(
        "test.run",
        { target: tail(input.command, "/test-run") },
        input.context,
      )
    ).summary;
  }

  if (lower.startsWith("/test-gen")) {
    return (
      await input.executeTool(
        "test.gen_cases",
        { source: tail(input.command, "/test-gen") },
        input.context,
      )
    ).summary;
  }

  if (lower.startsWith("/scan")) {
    return (
      await input.executeTool(
        "test.scan",
        { target: tail(input.command, "/scan") },
        input.context,
      )
    ).summary;
  }

  if (lower.startsWith("/report")) {
    return (
      await input.executeTool(
        "test.report",
        { target: tail(input.command, "/report") },
        input.context,
      )
    ).summary;
  }

  return "未知测试命令。";
}
