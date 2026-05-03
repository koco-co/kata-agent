# kata-agent v0.6: Testing-Domain CLI (概念文档)

> **状态:** 概念设计，供 Codex Superpowers 脑力风暴（brainstorming）使用
> **日期:** 2026-05-03
> **范围:** 将 kata-agent 从通用 NL 运行时改造为面向**测试领域**的终端 CLI 助手

---

## 1. 背景与动机

kata-agent 已完成 v0.5 NL Runtime 的基础建设：
- `ConversationAgent` 循环，支持流式 SSE 输出
- 6 个工具集（文件、Shell、工作流、制品、知识、审批）
- 会话管理（命名、保存、恢复、列表）
- 输出截断（50KB上限）
- Slash 命令体系（/help, /status, /new, /tools, /yolo, /exit, /title, /sessions, /resume）
- maxIterations 30，批量调用提示

**但当前的问题是：**
1. **身份太通用** — system prompt 说自己是"AI assistant for the kata-agent development platform"，跟 Chat GPT 没区别
2. **缺少测试领域工具** — 已有 plugins（Playwright, static-scan, XMind, Lanhu, Zentao）和 skills（test-case-gen, ui-script-gen, hotfix-case-gen），但没有注入到 ConversationAgent 中
3. **CLI 交互平淡** — 启动画面简陋，没有 Hermes Agent 那种 Platform 感
4. **缺少测试工作流感知** — 不理解"跑 E2E"、"检查 case"、"生成测试用例"等测试领域意图

## 2. 目标

**不追求通用 agent，而是做一个终端里的「测试助理 (Testing Co-pilot)」**，类似：
- Hermes Agent 的 CLI 交互体验
- 但所有能力都围绕**测试工作流**展开
- 无缝对接 kata 项目的 workspace（features/、tests/、reports/）

## 3. 核心改造方向

### 3.1 系统身份重塑

| 当前 | 目标 |
|------|------|
| "AI assistant for the kata-agent development platform" | "测试助理 — 专注于 E2E 测试、UI 自动化、测试用例生成与质量分析" |
| 无领域知识注入 | System prompt 内置：Playwright 概念、TestSpec、质量门禁、XMind、Lanhu PRD 工作流 |
| 无项目感知 | 自动检测 kata 项目 workspace，理解 features/、tests/cases/、runners/ 等目录语义 |

### 3.2 测试专属工具注入

将现有的 plugin/skill 能力转化为 ConversationAgent 的原生工具：

| 工具 | 来源 | 功能 |
|------|------|------|
| `test.run` | plugins/playwright | 运行 Playwright E2E 测试（指定 spec, worker, timeout） |
| `test.gen_cases` | skills/test-case-gen | 根据 PRD/XMind 生成测试用例 |
| `test.scan` | plugins/static-scan | 静态扫描：检查提测分支的代码质量问题 |
| `test.report` | plugins/report | 生成测试报告（支持多种格式） |
| `test.export_xmind` | plugins/xmind | 导出 XMind 思维导图 |
| `test.prepare_env` | tools/dtstack-sdk | 准备 dtstack 测试环境前置条件（建表、同步等） |
| `test.session` | playwright-session | 维护登录 session、Cookie 管理 |

### 3.3 CLI 体验升级

**当前启动画面：**
```
╔══════════════════════════════════════════╗
║    Kata Agent Chat — NL Runtime v0.5    ║
╚══════════════════════════════════════════╝
```

**目标体验（Hermes Agent 风格）：**
```
╔══════════════════════════════════════════╗
║    🧪 Kata Test Agent  —  v0.6         ║
║    Testing Co-pilot                      ║
╚══════════════════════════════════════════╝

📁 Workspace : /Users/poco/Projects/kata
🔬 Features  : 12 个待测 | 3 个进行中 | 46 个测试用例
🤖 Model     : deepseek-v4-flash
🆔 Session   : abc-def-123

> 输入 /help 查看测试命令，或直接描述你的测试需求
🤖 kata> 
```

**新增测试领域 slash 命令：**

| 命令 | 功能 |
|------|------|
| `/test-run <spec>` | 运行 Playwright 测试 |
| `/test-list` | 列出 workspace 中的测试用例 |
| `/test-gen <feature>` | 生成测试用例 |
| `/scan` | 执行静态扫描 |
| `/session <name>` | 管理 dtstack 测试登录 session |
| `/report` | 生成质量报告 |
| `/features` | 查看 workspace 中的 feature 列表 |

### 3.4 测试工作流感知

ConversationAgent 的 IntentBias 需要扩展，能识别以下测试领域意图：

| 用户输入 | 识别意图 | 自动动作 |
|----------|----------|----------|
| "帮我跑一下 E2E" | test_run | 列出可用 spec 文件，询问哪个 |
| "看看这个 feature 的覆盖" | test_coverage | 搜索 feature 对应 tests/，统计 case 数量 |
| "生成用例" | test_gen | 调用 test-case-gen skill |
| "检查提测质量" | static_scan | 执行静态扫描 |
| "登不上去了" | session_expired | 刷新 dtstack session |
| "这个 case 失败了" | test_debug | 定位失败 case，分析日志 |

### 3.5 与 kata 项目 workspace 的深度集成

kata-agent 需要理解 kata 项目的 workspace 结构：
- `workspace/{project}/features/{ym}-{slug}/` — 每个 feature 的测试目录
- `tests/cases/` — Playwright 测试用例
- `tests/runners/` — 测试运行器（full.spec.ts, smoke.spec.ts）
- `.auth/` — 登录 session 存储
- `tests/helpers/` — 测试辅助函数

启动时应自动检测 workspace 状态，展示：
- 有多少个活跃 features
- 有多少个测试用例
- 哪些 session 已过期

---

## 4. 排除范围（v0.6 不做）

- 消息网关（DingTalk, Slack, Telegram）— 保留给 v0.7+
- 定时任务 / cron job
- 长期记忆 / 知识推送
- 子 agent / 并行工作流
- 通用编程助手（不要跟 Cursor / Copilot 竞争）
- 替换现有 kata CLI 命令

## 5. 技术方向

- **保持 Bun/TypeScript 栈**，不引入新语言
- **复用已有的 plugins/skills**，不要重新发明
- **System prompt 测试领域化**，中英双语（以中文为主）
- **CLI 增强**只改 `apps/cli/src/chat.ts`
- **新工具**放在 `packages/conversation-agent/src/tools/` 下
- **Intent 扩展**改 `packages/conversation-agent/src/intent.ts`
- **不要侵入 kata 项目的 workspace** — 只读，不修改

---

## 6. 使用方式

```bash
# 启动测试助理
cd ~/Projects/kata
kata

# 或指定 workspace
kata --workspace ~/Projects/kata
```

---

*这份文档是概念输入，供 Codex 使用 Superpowers 方法论进行脑力风暴，
生成详细的实现计划（以 `docs/superpowers/plans/2026-05-0x-kata-agent-v0.6-testing-cli-plan.md` 保存）。*
