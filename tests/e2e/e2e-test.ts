// kata-agent v0.5 E2E 测试
// 直接调用 ConversationAgent 进行完整的端到端测试
import { ConversationAgent } from "../../packages/conversation-agent/src/agent";
import { createFileTools } from "../../packages/conversation-agent/src/tools/file-tools";
import { createShellTool } from "../../packages/conversation-agent/src/tools/shell-tools";
import { createKnowledgeTools } from "../../packages/conversation-agent/src/tools/knowledge-tools";
import { createArtifactTools } from "../../packages/conversation-agent/src/tools/artifact-tools";
import { createApprovalTool } from "../../packages/conversation-agent/src/tools/approval-tools";
import { createWorkflowTools } from "../../packages/conversation-agent/src/tools/workflow-tools";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

const API_KEY = process.env.KATA_AGENT_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const SESSION_DIR = resolve(homedir(), ".kata-agent", "e2e-sessions");
const APPROVAL_DIR = resolve(homedir(), ".kata-agent", "e2e-approvals");
const WORKSPACE = process.cwd();

if (!API_KEY) {
  console.error("❌ 未检测到 API Key。请设置 DEEPSEEK_API_KEY 或 KATA_AGENT_API_KEY");
  process.exit(1);
}

// 创建目录
for (const dir of [SESSION_DIR, APPROVAL_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function testSlashCommands() {
  console.log("\n📋 测试 Slash 命令...");

  const agent = new ConversationAgent({
    sessionDir: SESSION_DIR,
    workspaceRoot: WORKSPACE,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    apiKey: API_KEY,
    maxIterations: 30,
  });

  // 注册工具
  for (const t of Object.values(createFileTools(WORKSPACE))) agent.registerTool(t);
  agent.registerTool(createShellTool(WORKSPACE));
  for (const t of Object.values(createWorkflowTools())) agent.registerTool(t);
  for (const t of Object.values(createArtifactTools())) agent.registerTool(t);
  for (const t of Object.values(createKnowledgeTools())) agent.registerTool(t);
  agent.registerTool(createApprovalTool(APPROVAL_DIR));

  // 1. /help
  const help = await agent.handleSlashCommand("/help");
  assert("/help 返回系统提示词", help.includes("Available Tools") || help.includes("工具"), `长度: ${help.length}`);

  // 2. /status (中文)
  const status = await agent.handleSlashCommand("/status");
  assert("/status 中文显示", status.includes("会话状态"), status.slice(0, 60));
  assert("/status 显示模型信息", status.includes("deepseek-v4-flash"));
  assert("/status 显示 maxIterations=30", status.includes("30"));

  // 3. /yolo 切换
  assert("初始 yolo=false", agent.yolo === false);
  const y1 = await agent.handleSlashCommand("/yolo");
  assert("yolo 已启用", agent.yolo === true, y1);
  const y2 = await agent.handleSlashCommand("/yolo");
  assert("yolo 已关闭", agent.yolo === false, y2);

  // 4. /title <name>
  const title = await agent.handleSlashCommand("/title E2E测试会话");
  assert("/title 命名", title.includes("E2E测试会话"), title);
  const sessions = await agent.store.getRecentSessions(10);
  const current = sessions.find(s => s.sessionId === agent.sessionId);
  assert("元数据保存了名称", current?.name === "E2E测试会话", JSON.stringify(current?.name));

  // 5. /sessions 列表
  const list = await agent.handleSlashCommand("/sessions");
  assert("/sessions 列表", list.includes("最近 10 个会话") && list.includes("E2E测试会话"), list.slice(0, 100));

  // 6. /resume 自身
  const origId = agent.sessionId;
  const resume = await agent.handleSlashCommand(`/resume ${origId}`);
  assert("/resume 恢复", resume.includes("已恢复会话") && resume.includes(origId), resume.slice(0, 100));

  // 7. /new 重置
  const newCmd = await agent.handleSlashCommand("/new");
  assert("/new 重置", agent.sessionId !== origId, `新ID: ${agent.sessionId}`);
  assert("/new 重置 yolo", agent.yolo === false);
  assert("/new 中文回复", newCmd.includes("新会话"));

  // 8. 未知命令
  const unknown = await agent.handleSlashCommand("/unknown123");
  assert("未知命令提示", unknown.includes("未知命令"), unknown);

  console.log(`  📊 Slash 命令: ${passed - (passed + failed - 8)}/${8} 完成`);

  return agent;
}

async function testModelInteraction() {
  console.log("\n📋 测试模型交互...");

  const agent = new ConversationAgent({
    sessionDir: SESSION_DIR,
    workspaceRoot: WORKSPACE,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    apiKey: API_KEY,
    maxIterations: 30,
  });

  // 注册工具 (orchestrator 模式：保留所有工具，但通过提示词引导使用 codex_exec)
  for (const t of Object.values(createFileTools(WORKSPACE))) agent.registerTool(t);
  agent.registerTool(createShellTool(WORKSPACE));
  for (const t of Object.values(createWorkflowTools())) agent.registerTool(t);
  for (const t of Object.values(createArtifactTools())) agent.registerTool(t);
  for (const t of Object.values(createKnowledgeTools())) agent.registerTool(t);
  agent.registerTool(createApprovalTool(APPROVAL_DIR));

  // 1. 简单对话 — 回答知识性问题(不需要委派)
  console.log("  发送简单消息...");
  const r1 = await agent.processUserMessage("请用中文回复，只说一句话：你叫什么名字？");
  assert("模型返回内容", r1.finalResponse.length > 0, r1.finalResponse.slice(0, 100));
  assert("模型返回不含占位符", !r1.finalResponse.includes("MAX_ITERATIONS"));

  // 2. 检查 model 是否报告了 codex_exec 工具
  const messages = await agent.store.readMessages(agent.sessionId);
  const assistantMsgs = messages.filter(m => m.role === "assistant");
  assert("至少有一次模型调用", assistantMsgs.length >= 1, String(assistantMsgs.length));

  return agent;
}

async function testSessionPersistence() {
  console.log("\n📋 测试会话持久化...");

  const agent = new ConversationAgent({
    sessionDir: SESSION_DIR,
    workspaceRoot: WORKSPACE,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    apiKey: API_KEY,
    maxIterations: 30,
  });

  // 注册工具
  for (const t of Object.values(createFileTools(WORKSPACE))) agent.registerTool(t);
  agent.registerTool(createShellTool(WORKSPACE));

  const sessionId = agent.sessionId;

  // 发送消息
  await agent.processUserMessage("写入一条测试消息");
  await agent.handleSlashCommand("/title 持久化测试");

  // 保存元数据
  await agent.store.saveMetadata(sessionId, {
    name: "持久化测试",
    yolo: true,
    enabledToolsets: ["files", "shell"],
  });

  // 验证元数据
  const meta = await agent.store.getMetadata(sessionId);
  assert("元数据存在", !!meta, "metadata is undefined");
  assert("元数据名称", meta?.name === "持久化测试", JSON.stringify(meta?.name));
  assert("元数据 yolo", meta?.yolo === true, String(meta?.yolo));
  assert("元数据 messageCount > 0", (meta?.messageCount ?? 0) > 0, String(meta?.messageCount));

  // 验证会话列表
  const recent = await agent.store.getRecentSessions(5);
  assert("最近会话包含当前", recent.some(s => s.sessionId === sessionId), JSON.stringify(recent.map(s => s.sessionId)));

  // 模拟 /resume：创建新 agent 并恢复
  const agent2 = new ConversationAgent({
    sessionDir: SESSION_DIR,
    workspaceRoot: WORKSPACE,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    apiKey: API_KEY,
    maxIterations: 30,
  });
  for (const t of Object.values(createFileTools(WORKSPACE))) agent2.registerTool(t);
  agent2.registerTool(createShellTool(WORKSPACE));

  const resumeResult = await agent2.handleSlashCommand(`/resume ${sessionId}`);
  assert("新 agent 恢复会话", agent2.sessionId === sessionId, resumeResult.slice(0, 100));
  assert("恢复后 yolo=true", agent2.yolo === true, String(agent2.yolo));
  assert("恢复后 toolsets 正确", agent2.enabledToolsets.includes("files") && agent2.enabledToolsets.includes("shell"));

  return true;
}

// ---- 清理 ----
function cleanup() {
  try {
    const { rmSync } = require("fs");
    rmSync(SESSION_DIR, { recursive: true, force: true });
    rmSync(APPROVAL_DIR, { recursive: true, force: true });
  } catch {}
}

// ---- 主流程 ----
async function main() {
  console.log("╔═════════════════════════════════════╗");
  console.log("║   kata-agent v0.5 E2E 测试        ║");
  console.log(`║   时间: ${new Date().toISOString()}        `);
  console.log(`║   模型: deepseek-v4-flash           `);
  console.log("╚═════════════════════════════════════╝");

  // 测试 1: Slash 命令
  await testSlashCommands();

  // 测试 2: 模型交互 (真实 API 调用)
  await testModelInteraction();

  // 测试 3: 会话持久化
  await testSessionPersistence();

  // 汇总
  console.log("\n╔═════════════════════════════════════╗");
  console.log(`║   E2E 结果: ${passed} 通过, ${failed} 失败`);
  console.log("╚═════════════════════════════════════╝");

  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error(`\n❌ E2E 测试异常: ${err.message}`);
  process.exit(1);
});
