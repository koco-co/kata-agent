// ---------------------------------------------------------------------------
// @kata-agent/cli — Chat CLI: readline-based interactive conversation with
// the natural-language runtime agent.
// ---------------------------------------------------------------------------

import * as readline from "node:readline";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { ConversationAgent } from "../../../packages/conversation-agent/src/agent";
import { createFileTools } from "../../../packages/conversation-agent/src/tools/file-tools";
import { createShellTool } from "../../../packages/conversation-agent/src/tools/shell-tools";
import { createWorkflowTools } from "../../../packages/conversation-agent/src/tools/workflow-tools";
import { createArtifactTools } from "../../../packages/conversation-agent/src/tools/artifact-tools";
import { createKnowledgeTools } from "../../../packages/conversation-agent/src/tools/knowledge-tools";
import { createApprovalTool } from "../../../packages/conversation-agent/src/tools/approval-tools";

// ---------------------------------------------------------------------------
// ChatOptions
// ---------------------------------------------------------------------------

export interface ChatOptions {
  workspaceRoot?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Start the interactive chat loop.
 *
 * Creates session and approval directories under `~/.kata-agent/`, instantiates
 * a ConversationAgent, registers all tools, and runs a readline-based prompt
 * with `🤖 kata> ` prefix.
 *
 * Slash commands:
 *   /help   — Show full system prompt with available tools
 *   /status — Show session status (ID, yolo mode, toolsets, model)
 *   /new    — Reset session (new ID, clear context)
 *   /tools  — List available tools by toolset
 *   /yolo   — Toggle yolo mode
 *   /exit   — End the session
 *
 * Non-slash input is delegated to `agent.processUserMessage()`.
 */
export function startChat(options: ChatOptions = {}): void {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const sessionDir = resolve(homedir(), ".kata-agent", "sessions");
  const approvalDir = resolve(homedir(), ".kata-agent", "approvals");
  const model = options.model ?? "deepseek-v4-flash";
  const provider = options.provider ?? "deepseek";
  const apiKey =
    options.apiKey ?? process.env.KATA_AGENT_API_KEY ?? "test-key";

  // Ensure directories exist
  ensureDir(sessionDir);
  ensureDir(approvalDir);

  // Create the agent
  const agent = new ConversationAgent({
    sessionDir,
    workspaceRoot,
    model,
    provider,
    apiKey,
  });

  // ---- Register all tools ----

  // File tools (file.list, file.read, file.write)
  const fileTools = createFileTools(workspaceRoot);
  for (const tool of Object.values(fileTools)) {
    agent.registerTool(tool);
  }

  // Shell tool (shell.exec)
  const shellTool = createShellTool(workspaceRoot);
  agent.registerTool(shellTool);

  // Workflow tools (workflow.start, .status, .resume, .find_runs)
  const workflowTools = createWorkflowTools();
  for (const tool of Object.values(workflowTools)) {
    agent.registerTool(tool);
  }

  // Artifact tools (artifact.list, .read, .summarize)
  const artifactTools = createArtifactTools();
  for (const tool of Object.values(artifactTools)) {
    agent.registerTool(tool);
  }

  // Knowledge tools (knowledge.search, .suggestions, .accept, .reject)
  const knowledgeTools = createKnowledgeTools();
  for (const tool of Object.values(knowledgeTools)) {
    agent.registerTool(tool);
  }

  // Approval tool (approval.request)
  const approvalTool = createApprovalTool(approvalDir);
  agent.registerTool(approvalTool);

  // ---- Set up readline interface ----

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🤖 kata> ",
  });

  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Kata Agent Chat — NL Runtime v0.5    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");
  console.log(`  Workspace : ${workspaceRoot}`);
  console.log(`  Model     : ${model} (${provider})`);
  console.log(`  Session   : ${agent.sessionId}`);
  console.log("");
  console.log("  Type /help for available commands, /exit to quit.");
  console.log("");

  rl.prompt();

  // ---- Handle input ----

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith("/")) {
      const response = agent.handleSlashCommand(trimmed);

      if (trimmed === "/exit") {
        console.log(response);
        rl.close();
        return;
      }

      console.log(`\n${response}\n`);
      rl.prompt();
      return;
    }

    // Process user message through the agent pipeline
    try {
      const result = await agent.processUserMessage(trimmed);
      console.log(`\n${result.finalResponse}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${msg}\n`);
    }

    rl.prompt();
  });

  // ---- Clean exit ----

  rl.on("close", () => {
    console.log("\nGoodbye! Session ended.\n");
    process.exit(0);
  });
}
