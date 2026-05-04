// ---------------------------------------------------------------------------
// @kata-agent/cli — Chat CLI: readline-based interactive conversation with
// the natural-language runtime agent.
// ---------------------------------------------------------------------------

import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { featureDir } from "../../../packages/artifact-repo/src/index";
import { ConversationAgent } from "../../../packages/conversation-agent/src/agent";
import { createFileTools } from "../../../packages/conversation-agent/src/tools/file-tools";
import { createShellTool } from "../../../packages/conversation-agent/src/tools/shell-tools";
import {
  createWorkflowTools,
  type WorkflowFindRunsInput,
  type WorkflowRunLookupInput,
  type WorkflowStartInput,
  type WorkflowToolController,
  type WorkflowToolRun,
} from "../../../packages/conversation-agent/src/tools/workflow-tools";
import { createArtifactTools } from "../../../packages/conversation-agent/src/tools/artifact-tools";
import { createKnowledgeTools } from "../../../packages/conversation-agent/src/tools/knowledge-tools";
import { createApprovalTool } from "../../../packages/conversation-agent/src/tools/approval-tools";
import {
  createTestingTools,
  discoverTestingWorkspace,
} from "../../../packages/conversation-agent/src/testing";
import {
  createRuntimeServices,
  loadWorkflowState,
  type WorkflowDefinition,
  type WorkflowRunState,
} from "../../../packages/workflow-engine/src/index";
import { createChatTestingActionBridge } from "./chat-testing-actions";

const ANSI_GRAY = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

// ---------------------------------------------------------------------------
// ChatOptions
// ---------------------------------------------------------------------------

export interface ChatOptions {
  workspaceRoot?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  apiBase?: string;
  stream?: boolean;
}

export interface TerminalChatResponse {
  finalResponse: string;
  reasoningContent?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function loadWorkflowDefinition(
  workspaceRoot: string,
  workflowName: string,
): WorkflowDefinition {
  if (!/^[a-z0-9-]+$/.test(workflowName)) {
    throw new Error(`Invalid workflow name: ${workflowName}`);
  }
  return YAML.parse(
    readFileSync(
      join(workspaceRoot, "workflows", `${workflowName}.yaml`),
      "utf8",
    ),
  ) as WorkflowDefinition;
}

function parseFeatureDir(path: string): {
  rootDir: string;
  project: string;
  feature: string;
} {
  const resolved = resolve(path);
  return {
    rootDir: dirname(dirname(dirname(dirname(resolved)))),
    project: basename(dirname(dirname(resolved))),
    feature: basename(resolved),
  };
}

function stateToRun(
  state: WorkflowRunState,
  featureWorkspaceDir: string,
): WorkflowToolRun {
  const location = parseFeatureDir(featureWorkspaceDir);
  return {
    runId: state.runId,
    workflowName: state.workflowId,
    status: state.status,
    currentNode: state.currentNode,
    project: location.project,
    feature: location.feature,
    featureDir: featureWorkspaceDir,
  };
}

function findWorkflowRun(
  workspaceRoot: string,
  input: WorkflowRunLookupInput | WorkflowFindRunsInput,
): Array<{ state: WorkflowRunState; featureWorkspaceDir: string }> {
  const results: Array<{
    state: WorkflowRunState;
    featureWorkspaceDir: string;
  }> = [];
  const projectsDir = join(workspaceRoot, "projects");
  if (!existsSync(projectsDir)) return results;
  for (const project of readdirSync(projectsDir)) {
    if (input.project && project !== input.project) continue;
    const featuresDir = join(projectsDir, project, "features");
    if (!existsSync(featuresDir)) continue;
    for (const feature of readdirSync(featuresDir)) {
      if ("feature" in input && input.feature && feature !== input.feature) {
        continue;
      }
      const featureWorkspaceDir = join(featuresDir, feature);
      const stateDir = join(featureWorkspaceDir, ".state");
      if (!existsSync(stateDir)) continue;
      for (const file of readdirSync(stateDir)) {
        if (!file.endsWith(".json")) continue;
        const state = JSON.parse(
          readFileSync(join(stateDir, file), "utf8"),
        ) as WorkflowRunState;
        if ("runId" in input && input.runId && state.runId !== input.runId) {
          continue;
        }
        if (
          "workflowName" in input &&
          input.workflowName &&
          state.workflowId !== input.workflowName
        ) {
          continue;
        }
        results.push({ state, featureWorkspaceDir });
      }
    }
  }
  return results;
}

function createChatWorkflowController(
  workspaceRoot: string,
): WorkflowToolController {
  const locateRun = (input: WorkflowRunLookupInput) => {
    if (input.featureDir) {
      return {
        featureWorkspaceDir: input.featureDir,
        state: loadWorkflowState(input.featureDir, input.runId),
      };
    }
    if (input.project && input.feature) {
      const featureWorkspaceDir = featureDir({
        rootDir: workspaceRoot,
        project: input.project,
        feature: input.feature,
      });
      return {
        featureWorkspaceDir,
        state: loadWorkflowState(featureWorkspaceDir, input.runId),
      };
    }
    const [found] = findWorkflowRun(workspaceRoot, input);
    if (!found) throw new Error(`Workflow run not found: ${input.runId}`);
    return found;
  };

  return {
    async start(input: WorkflowStartInput): Promise<WorkflowToolRun> {
      if (!input.project) throw new Error("project is required");
      if (!input.feature) throw new Error("feature is required");
      const workflowName = input.workflowName;
      const definition = loadWorkflowDefinition(workspaceRoot, workflowName);
      const mode = input.mode ?? "mock";
      const { executor } = createRuntimeServices({
        rootDir: workspaceRoot,
        mode,
        requireProviderConfig: mode === "real",
        notifyMode: "off",
      });
      const result = await executor.start({
        location: {
          rootDir: workspaceRoot,
          project: input.project,
          feature: input.feature,
        },
        definition,
        runId: input.runId ?? randomUUID(),
        sourceUrl: input.sourceUrl,
        inputs: input.inputs,
      });
      return stateToRun(
        result.state,
        featureDir({
          rootDir: workspaceRoot,
          project: input.project,
          feature: input.feature,
        }),
      );
    },

    async status(input: WorkflowRunLookupInput): Promise<WorkflowToolRun> {
      const found = locateRun(input);
      return stateToRun(found.state, found.featureWorkspaceDir);
    },

    async resume(input: WorkflowRunLookupInput): Promise<WorkflowToolRun> {
      const found = locateRun(input);
      const location = parseFeatureDir(found.featureWorkspaceDir);
      const mode = input.mode ?? "mock";
      const { executor } = createRuntimeServices({
        rootDir: location.rootDir,
        mode,
        requireProviderConfig: mode === "real",
        notifyMode: "off",
      });
      const result = await executor.resume({
        location,
        definition: loadWorkflowDefinition(location.rootDir, found.state.workflowId),
        runId: input.runId,
      });
      return stateToRun(result.state, found.featureWorkspaceDir);
    },

    async findRuns(input: WorkflowFindRunsInput) {
      return {
        runs: findWorkflowRun(workspaceRoot, input)
          .map((item) => stateToRun(item.state, item.featureWorkspaceDir))
          .sort((a, b) => b.runId.localeCompare(a.runId))
          .slice(0, 20),
      };
    },
  };
}

export function formatChatResponseForTerminal(
  result: TerminalChatResponse,
): string {
  const reasoning = result.reasoningContent?.trim();
  if (!reasoning) {
    return result.finalResponse;
  }

  return [
    `${ANSI_GRAY}🤔 模型推理过程：`,
    reasoning,
    "---",
    `${ANSI_RESET}${result.finalResponse}`,
  ].join("\n");
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
  const model = options.model ?? process.env.KATA_AGENT_MODEL ?? "deepseek-v4-flash";
  const provider = options.provider ?? process.env.KATA_AGENT_PROVIDER ?? "deepseek";
  const apiKey =
    options.apiKey ??
    process.env.KATA_AGENT_API_KEY ??
    process.env.DEEPSEEK_API_KEY ??
    "";
  const apiBase =
    options.apiBase ??
    process.env.KATA_AGENT_BASE_URL ??
    process.env.DEEPSEEK_BASE_URL ??
    "https://api.deepseek.com";
  const stream =
    options.stream ??
    readBooleanEnv(process.env.KATA_AGENT_STREAM);

  if (apiKey.trim().length === 0) {
    console.error(
      "警告：未检测到 API Key。请先设置 DEEPSEEK_API_KEY（或 KATA_AGENT_API_KEY）后再启动聊天。",
    );
    process.exit(1);
  }

  // Ensure directories exist
  ensureDir(sessionDir);
  ensureDir(approvalDir);

  const testingWorkspace = discoverTestingWorkspace(workspaceRoot);

  // Create the agent
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
  const workflowTools = createWorkflowTools(
    createChatWorkflowController(workspaceRoot),
  );
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

  // Testing tools (test.run, test.gen_cases, test.scan, ...)
  const testingTools = createTestingTools(
    createChatTestingActionBridge({ workspaceRoot }),
  );
  for (const tool of testingTools) {
    agent.registerTool(tool);
  }

  // ---- Set up readline interface ----

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🤖 kata> ",
  });

  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Kata Agent Chat — Testing CLI v0.6    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");
  console.log(`  Workspace : ${workspaceRoot}`);
  console.log(`  Model     : ${model} (${provider})`);
  console.log(`  Session   : ${agent.sessionId}`);
  console.log(`  Features  : ${testingWorkspace.featureCount}`);
  console.log(`  Specs     : ${testingWorkspace.specCount}`);
  console.log(`  Reports   : ${testingWorkspace.reportCount}`);
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
      const response = await agent.handleSlashCommand(trimmed);

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
      let streamedTokenCount = 0;
      let streamedReasoningTokenCount = 0;
      let reasoningBlockOpen = false;
      let finalContentStarted = false;

      const closeReasoningBlock = () => {
        if (reasoningBlockOpen && !finalContentStarted) {
          process.stdout.write(`\n---\n${ANSI_RESET}`);
          finalContentStarted = true;
        }
      };

      const result = await agent.processUserMessage(trimmed, {
        onStreamToken: stream
          ? (token: string) => {
              closeReasoningBlock();
              streamedTokenCount++;
              process.stdout.write(token);
            }
          : undefined,
        onReasoningToken: stream
          ? (token: string) => {
              if (!reasoningBlockOpen) {
                process.stdout.write(`\n${ANSI_GRAY}🤔 模型推理过程：\n`);
                reasoningBlockOpen = true;
              }
              streamedReasoningTokenCount++;
              process.stdout.write(token);
            }
          : undefined,
      });

      if (stream && (streamedTokenCount > 0 || streamedReasoningTokenCount > 0)) {
        closeReasoningBlock();
        if (streamedTokenCount === 0 && result.finalResponse.length > 0) {
          process.stdout.write(result.finalResponse);
        }
        console.log("\n");
      } else {
        console.log(`\n${formatChatResponseForTerminal(result)}\n`);
      }
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
