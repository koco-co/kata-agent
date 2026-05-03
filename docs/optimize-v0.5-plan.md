# Kata Agent v0.5 优化计划 (参考 Hermes Agent 架构)

## 优化目标

参考 Hermes Agent 的设计，对 kata-agent v0.5 进行 8 项优化，提升用户体验和任务完成率。

## 优化列表

### 1. maxIterations 提升 + 可配置
- **修改文件**: `packages/conversation-agent/src/agent.ts`
- **改动**: `maxIterations` 默认值从 10 改为 30
- **原因**: DeepSeek v4 flash 通常一次只调 1 个工具，10 轮不足以完成复杂任务；Hermes 默认 90 轮
- **需改行**: 第 52 行 `config.maxIterations ?? 10` → `?? 30`

### 2. 系统提示词优化 — 鼓励批量工具调用
- **修改文件**: `packages/conversation-agent/src/prompts.ts`
- **改动**: 在 TOOL_USAGE_RULES 或 Response Guidelines 添加段落：
  - 鼓励一次性发出多个独立工具调用
  - 示例：同时读取多个文件、并行查看多个目录
  - 解释：批处理减少迭代次数，避免 maxIterations 限制
- **原因**: Hermes 提示词明确鼓励并行调用，提高效率

### 3. 更好的 maxIterations 到达提示
- **修改文件**: `packages/conversation-agent/src/agent.ts`
- **改动**: 第 363 行的 finalResponse 改为中文友好提示：
  - 提示用户任务未完成
  - 建议分步执行或启用 /yolo 模式
  - 列出已完成/未完成的步骤（如有）
- **原因**: 当前英文提示对中文用户不友好，缺乏 actionable advice

### 4. 流式输出 (Streaming)
- **修改文件**: 
  - `packages/conversation-agent/src/provider.ts` — 添加流式请求支持
  - `packages/conversation-agent/src/agent.ts` — 流式回调
  - `apps/cli/src/chat.ts` — 实时显示流式输出
- **改动**: 
  - Provider 端添加 `stream` 参数，使用 fetch SSE 解析
  - Agent 端添加 callback: `onStreamToken?: (token: string) => void`
  - CLI 端在模型响应时逐个 token 打印
- **注意**: 默认为非流式（保持向后兼容），通过配置可开启

### 5. DeepSeek reasoning_content 终端显示
- **修改文件**: 
  - `packages/conversation-agent/src/agent.ts` — 提取 reasoning 内容
  - `apps/cli/src/chat.ts` — 显示推理过程
- **改动**: 
  - 当 provider 返回 reasoningContent 时，用灰色/不同颜色显示在终端
  - 在显示最终回复前先显示 "🤔 [推理过程]..." 再显示结论
- **原因**: DeepSeek 的 reasoning 模式已有完整支持，但用户看不到思考过程

### 6. 会话命名与管理
- **修改文件**: 
  - `packages/conversation-agent/src/types.ts` — 添加 session 元数据
  - `packages/conversation-agent/src/session-store.ts` — 元数据存储
  - `apps/cli/src/chat.ts` — 新 slash 命令
- **改动**:
  - 添加 `/title <name>` — 为当前会话命名
  - 添加 `/sessions` — 列出最近 10 个会话
  - 添加 `/resume [id]` — 恢复指定会话（保持 yolo/tools 状态）
  - session metadata: name, createdAt, toolCount, messageCount
- **原因**: Hermes 的 `--continue` 和 `/resume` 让会话管理更高效

### 7. 工具执行进度展示
- **修改文件**: `packages/conversation-agent/src/agent.ts`
- **改动**: 
  - 在执行 each tool call 时打印 "🔧 [工具名]: 正在执行..."
  - 完成时打印 "✅ [工具名]: 完成"
  - 保持颜色区分
- **原因**: 当前只显示 "正在请求模型" 前/后，看不到中间步骤的进展

### 8. 工具输出截断保护
- **修改文件**: `packages/conversation-agent/src/tool-runtime.ts`
- **改动**: 
  - 工具结果 summary 超过 50KB 时自动截断
  - 添加截断标记 `[output_truncated_to_N_bytes]`
- **原因**: Shell 命令可以产生大量输出，不加截断会浪费 token

## 执行顺序

1. 创建分支 `optimize/v0.5-hugely-improved`
2. 按顺序实施 1→8（无依赖冲突）
3. 每次修改后运行 `bun test` 确保测试通过
4. 运行 `bun run typecheck` 确保类型正确
5. 运行 E2E 验证（新建会话测试）
6. 合并到 main
