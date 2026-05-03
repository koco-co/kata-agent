# kata-agent 重构：Codex 委派架构

## 当前问题
kata-agent 自己调用 DeepSeek + 自己执行工具，但 DeepSeek 在工具调用上效率低（一次只调一个工具，maxIterations 容易触顶）。

## 目标架构
kata-agent 作为"调度/对话层"，所有需要执行的实际工作委派给 Codex CLI：

```
用户输入
  ↓
kata-agent (DeepSeek) — 理解意图，决定策略
  ↓ 需要行动？
codex.exec 工具 → Codex CLI 执行任务
  ↓
kata-agent 整理结果返回用户
```

## 核心改动

### 1. 新增 codex.exec 工具
- 接收 `task` (任务描述字符串)
- 调用 `codex exec --yolo -c 'model="gpt-5.5"' <task>`
- 返回执行结果（stdout + exit_code）

### 2. 修改系统提示词
- 告诉模型：你的角色是"调度官"
- 简单问题直接回复
- 任何需要文件操作、代码编写、Shell 命令的任务 → 使用 codex.exec 委派给 Codex
- 委派时清晰描述任务上下文

### 3. 简化工具集
- 移除 file tools、shell tools 的直接调用（这些由 Codex 处理）
- kata-agent 只需要：codex.exec、knowledge.search（知识查询）、approval.request
- 保持轻量

## 实现步骤
1. 添加 CodexExecTool（执行 codex exec 并捕获输出）
2. 修改系统提示词为"调度官"角色
3. 调整注册的工具列表
4. 运行 E2E 测试验证
