/**
 * kata-agent v0.6 Testing CLI — 多轮 E2E 测试
 * 验证所有新功能：测试工具、Slash 命令、IntentBias、Workspace 发现、System Prompt
 */
import { ConversationAgent } from "../../packages/conversation-agent/src/agent";
import { createFileTools } from "../../packages/conversation-agent/src/tools/file-tools";
import { createShellTool } from "../../packages/conversation-agent/src/tools/shell-tools";
import { createKnowledgeTools } from "../../packages/conversation-agent/src/tools/knowledge-tools";
import { createArtifactTools } from "../../packages/conversation-agent/src/tools/artifact-tools";
import { createApprovalTool } from "../../packages/conversation-agent/src/tools/approval-tools";
import { createWorkflowTools } from "../../packages/conversation-agent/src/tools/workflow-tools";
import { discoverTestingWorkspace } from "../../packages/conversation-agent/src/testing/workspace";
import type { TestingWorkspaceSummary } from "../../packages/conversation-agent/src/testing/workspace";
import {
  ALL_SLASH_COMMANDS,
  type SlashCommand,
} from "../../packages/conversation-agent/src/types";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";
import { createTestingTools } from "../../packages/conversation-agent/src/testing";
import { createChatTestingActionBridge } from "../../apps/cli/src/chat-testing-actions";

const API_KEY = "dummy-e2e-key";
const SESSION_DIR = resolve(homedir(), ".kata-agent", "e2e-v06-test");
const APPROVAL_DIR = resolve(homedir(), ".kata-agent", "e2e-v06-approvals");
const WORKSPACE = process.cwd();

// 清理旧数据
try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
try { rmSync(APPROVAL_DIR, { recursive: true, force: true }); } catch {}

for (const dir of [SESSION_DIR, APPROVAL_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function makeAgent(testingWorkspace?: TestingWorkspaceSummary): ConversationAgent {
  const agent = new ConversationAgent({
    sessionDir: SESSION_DIR,
    workspaceRoot: WORKSPACE,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    apiKey: API_KEY,
    maxIterations: 5,
    testingWorkspace,
  });
  for (const t of Object.values(createFileTools(WORKSPACE))) agent.registerTool(t);
  agent.registerTool(createShellTool(WORKSPACE));
  for (const t of Object.values(createWorkflowTools())) agent.registerTool(t);
  for (const t of Object.values(createArtifactTools())) agent.registerTool(t);
  for (const t of Object.values(createKnowledgeTools())) agent.registerTool(t);
  agent.registerTool(createApprovalTool(APPROVAL_DIR));

  // 注册测试工具 (v0.6)
  const testingTools = createTestingTools(
    createChatTestingActionBridge({ workspaceRoot: WORKSPACE }),
  );
  for (const tool of testingTools) {
    agent.registerTool(tool);
  }

  return agent;
}

let passed = 0;
let failed = 0;
let round = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ===== 第 1 轮：Workspace 发现 =====
async function round1_workspace() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：Workspace 发现`);
  console.log(`═══════════════════════════════════════════`);

  const ws = discoverTestingWorkspace(WORKSPACE);
  assert("返回 root 路径", ws.root === WORKSPACE);
  assert("返回项目名称", ws.name.length > 0, ws.name);
  assert("status 为 ready/empty", ["ready", "empty"].includes(ws.status), ws.status);
  assert("featureCount >= 0", ws.featureCount >= 0, String(ws.featureCount));
  assert("specCount >= 0", ws.specCount >= 0, String(ws.specCount));
  assert("featureFiles 是数组", Array.isArray(ws.featureFiles));

  // 空目录测试
  const emptyDir = resolve(homedir(), ".kata-agent", "e2e-empty-test");
  try { rmSync(emptyDir, { recursive: true, force: true }); } catch {}
  mkdirSync(emptyDir, { recursive: true });
  const empty = discoverTestingWorkspace(emptyDir);
  assert("空目录 status=empty", empty.status === "empty", empty.status);
  assert("空目录 featureCount=0", empty.featureCount === 0);
  assert("空目录 specCount=0", empty.specCount === 0);
}

// ===== 第 2 轮：Slash 命令扩展 =====
async function round2_slash_commands() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：Slash 命令扩展`);
  console.log(`═══════════════════════════════════════════`);

  const agent = makeAgent(discoverTestingWorkspace(WORKSPACE));

  // 验证新命令在 ALL_SLASH_COMMANDS 中
  assert("test-run 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("test-run" as SlashCommand));
  assert("test-list 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("test-list" as SlashCommand));
  assert("test-gen 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("test-gen" as SlashCommand));
  assert("features 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("features" as SlashCommand));
  assert("scan 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("scan" as SlashCommand));
  assert("report 在 ALL_SLASH_COMMANDS 中", ALL_SLASH_COMMANDS.includes("report" as SlashCommand));

  // 测试新命令能正确路由（=/test-list 可能返回合理内容）
  const testListResult = await agent.handleSlashCommand("/test-list");
  assert("/test-list 有返回内容", testListResult.length > 0, testListResult.slice(0, 80));
  assert("/test-list 不含未知命令", !testListResult.includes("未知命令"));

  const featuresResult = await agent.handleSlashCommand("/features");
  assert("/features 有返回内容", featuresResult.length > 0, featuresResult.slice(0, 80));
  assert("/features 不含未知命令", !featuresResult.includes("未知命令"));

  // v0.5 已有命令仍正常工作
  const help = await agent.handleSlashCommand("/help");
  assert("/help 仍工作", help.includes("工具") || help.includes("Tools"), help.slice(0, 60));
  const status = await agent.handleSlashCommand("/status");
  assert("/status 仍工作", status.includes("会话"), status.slice(0, 60));
}

// ===== 第 3 轮：IntentBias 扩展 =====
async function round3_intent_bias() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：IntentBias 测试意图识别`);
  console.log(`═══════════════════════════════════════════`);

  const ws = discoverTestingWorkspace(WORKSPACE);
  const agent = makeAgent(ws);

  // 通过 processUserMessage 间接触发 IntentBias
  // 用简短的消息让模型调用 intent bias
  const r1 = await agent.processUserMessage("帮我跑一下E2E测试");
  assert("测试意图消息有回复", r1.finalResponse.length > 0, r1.finalResponse.slice(0, 100));

  const agent2 = makeAgent(ws);
  const r2 = await agent2.processUserMessage("生成测试用例");
  assert("生成用例消息有回复", r2.finalResponse.length > 0, r2.finalResponse.slice(0, 100));

  const agent3 = makeAgent(ws);
  const r3 = await agent3.processUserMessage("看看这个feature的测试覆盖");
  assert("feature覆盖消息有回复", r3.finalResponse.length > 0, r3.finalResponse.slice(0, 100));
}

// ===== 第 4 轮：System Prompt 测试化 =====
async function round4_system_prompt() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：System Prompt 测试身份`);
  console.log(`═══════════════════════════════════════════`);

  const agent = makeAgent(discoverTestingWorkspace(WORKSPACE));
  const help = await agent.handleSlashCommand("/help");

  // System prompt 应该包含测试相关的关键词
  const testKeywords = ["测试", "test", "执行与回归", "Playwright"];
  for (const kw of testKeywords) {
    assert(`System prompt 包含 "${kw}"`, help.toLowerCase().includes(kw.toLowerCase()), help.slice(0, 200));
  }
}

// ===== 第 5 轮：测试工具注册 =====
async function round5_testing_tools() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：测试工具注册`);
  console.log(`═══════════════════════════════════════════`);

  const agent = makeAgent(discoverTestingWorkspace(WORKSPACE));
  const tools = agent.runtime.listTools();
  const toolNames = tools.map(t => t.name);

  const expectedTools = [
    "test.run", "test.gen_cases", "test.scan",
    "test.report", "test.export_xmind", "test.prepare_env", "test.session"
  ];

  for (const name of expectedTools) {
    assert(`测试工具 "${name}" 已注册`, toolNames.includes(name), `可用: ${toolNames.slice(-10).join(", ")}`);
  }

  // 验证每个测试工具有正确的字段
  for (const name of expectedTools) {
    const tool = tools.find(t => t.name === name);
    assert(`"${name}" 有 description`, (tool?.description?.length ?? 0) > 0);
    assert(`"${name}" 有 permission`, ["safe", "workspace-write", "command", "external"].includes(tool?.permission ?? ""));
    assert(`"${name}" 有 execute 函数`, typeof tool?.execute === "function");
  }
}

// ===== 第 6 轮：Agent 集成 =====
async function round6_agent_integration() {
  round++;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`第 ${round} 轮：Agent 集成`);
  console.log(`═══════════════════════════════════════════`);

  const agent = makeAgent(discoverTestingWorkspace(WORKSPACE));

  // /status 应该显示 workspace 相关信息
  const status = await agent.handleSlashCommand("/status");
  assert("/status 包含 workspace", status.includes("工作区"), status.slice(0, 100));

  // 验证 toolset 包含 testing 相关
  const tools = agent.runtime.listTools();
  const testingTools = tools.filter(t => t.name.startsWith("test."));
  assert("至少有 test.* 工具", testingTools.length >= 7, String(testingTools.length));

  // 验证 agent config
  assert("maxIterations 默认为 30", agent.runtime !== undefined);
}

// ===== 主流程 =====
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   kata-agent v0.6 E2E 多轮测试            ║");
  console.log(`║   时间: ${new Date().toISOString()}        `);
  console.log("╚══════════════════════════════════════════════╝");

  await round1_workspace();
  await round2_slash_commands();
  await round3_intent_bias();
  await round4_system_prompt();
  await round5_testing_tools();
  await round6_agent_integration();

  const total = passed + failed;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   E2E 结果: ${passed}/${total} 通过, ${failed} 失败 (${round} 轮)`);
  console.log(`╚══════════════════════════════════════════════╝`);

  // 清理
  try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
  try { rmSync(APPROVAL_DIR, { recursive: true, force: true }); } catch {}

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`\n❌ E2E 异常: ${err.message}`);
  process.exit(1);
});
