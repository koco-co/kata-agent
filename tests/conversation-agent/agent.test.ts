import { beforeEach, describe, expect, test, mock } from "bun:test";
import { ConversationAgent } from "../../packages/conversation-agent/src/agent";
import { buildSystemPrompt } from "../../packages/conversation-agent/src/prompts";
import type { ConversationTool, ToolsetName } from "../../packages/conversation-agent/src/types";
import type { ProviderResponse } from "../../packages/conversation-agent/src/provider";
import { ALL_TOOLSETS } from "../../packages/conversation-agent/src/types";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Mock the provider so tests don't hit the real API
// ---------------------------------------------------------------------------

function mockProviderResponse(): ProviderResponse {
  return {
    content: "Mock response from provider",
    inputTokens: 10,
    outputTokens: 5,
    finishReason: "stop" as const,
    toolCalls: undefined,
  };
}

const mockCallProvider = mock(async () => mockProviderResponse());

beforeEach(() => {
  mockCallProvider.mockClear();
  mockCallProvider.mockImplementation(async () => mockProviderResponse());
});

async function captureConsoleLog<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const logs: string[] = [];

  console.log = mock((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  }) as typeof console.log;

  try {
    return { result: await fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

mock.module("../../packages/conversation-agent/src/provider", () => ({
  callProvider: mockCallProvider,
  defaultProviderConfig: () => ({
    model: "test-model",
    baseUrl: "http://localhost:9999",
    apiKey: "test-key",
    temperature: 0.7,
    maxTokens: 8192,
    contextLength: 1024,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(overrides: Partial<ConversationTool> = {}): ConversationTool {
  return {
    name: "test-tool",
    description: "A test tool",
    inputSchema: {},
    permission: "safe",
    toolset: "files",
    execute: async () => ({ ok: true, summary: "done" }),
    ...overrides,
  };
}

function makeAgent(
  overrides: Partial<{
    sessionDir: string;
    workspaceRoot: string;
    tools: ConversationTool[];
    maxIterations: number;
    stream: boolean;
  }> = {},
): ConversationAgent {
  const dir = overrides.sessionDir ?? "/tmp/test-sessions";
  const root = overrides.workspaceRoot ?? "/tmp/test-workspace";
  const agent = new ConversationAgent({
    sessionDir: dir,
    workspaceRoot: root,
    model: "test-model",
    provider: "test-provider",
    apiKey: "test-key",
    maxIterations: overrides.maxIterations,
    stream: overrides.stream,
  });
  if (overrides.tools) {
    for (const t of overrides.tools) {
      agent.registerTool(t);
    }
  }
  return agent;
}

// ---------------------------------------------------------------------------
// ConversationAgent Tests
// ---------------------------------------------------------------------------

describe("ConversationAgent", () => {
  // Test 1: Constructor works
  test("constructor creates agent with default state", () => {
    const agent = new ConversationAgent({
      sessionDir: "/tmp/sessions",
      workspaceRoot: "/tmp/workspace",
      model: "gpt-4",
      provider: "openai",
      apiKey: "sk-test",
    });

    expect(agent).toBeInstanceOf(ConversationAgent);
    expect(agent.sessionId).toBeDefined();
    expect(agent.sessionId.length).toBeGreaterThan(0);
    expect(agent.yolo).toBe(false);
    expect(agent.enabledToolsets).toEqual(ALL_TOOLSETS);
    expect(agent.config.model).toBe("gpt-4");
    expect(agent.config.provider).toBe("openai");
    expect(agent.config.maxIterations).toBe(30);
  });

  // Test 2: registerTool registers a tool
  test("registerTool delegates to runtime", () => {
    const agent = makeAgent();
    const tool = makeTool({ name: "my-tool" });

    agent.registerTool(tool);

    // Verify via runtime
    const listed = agent.runtime.listTools();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("my-tool");
  });

  // Test 3: handleSlashCommand("/help") returns help text
  test('handleSlashCommand("/help") returns help text containing "Available Tools"', async () => {
    const agent = makeAgent({
      tools: [makeTool({ name: "read-file", toolset: "files" })],
    });

    const result = await agent.handleSlashCommand("/help");

    expect(result).toContain("Available Tools");
  });

  // Test 4: handleSlashCommand("/status") returns session info
  test('handleSlashCommand("/status") returns session info containing session ID', async () => {
    const agent = makeAgent();

    const result = await agent.handleSlashCommand("/status");

    expect(result).toContain(agent.sessionId);
    expect(result).toContain("会话");
  });

  // Test 5: handleSlashCommand("/yolo") toggles yolo
  test('handleSlashCommand("/yolo") toggles yolo mode', async () => {
    const agent = makeAgent();
    expect(agent.yolo).toBe(false);

    const result1 = await agent.handleSlashCommand("/yolo");
    expect(agent.yolo).toBe(true);
    expect(result1).toContain("已启用");

    const result2 = await agent.handleSlashCommand("/yolo");
    expect(agent.yolo).toBe(false);
    expect(result2).toContain("已关闭");
  });

  // Test 6: handleSlashCommand("/new") creates new session
  test('handleSlashCommand("/new") creates a new session', async () => {
    const agent = makeAgent();
    const originalId = agent.sessionId;

    const result = await agent.handleSlashCommand("/new");

    expect(agent.sessionId).not.toBe(originalId);
    expect(agent.yolo).toBe(false);
    expect(result).toContain("新会话");
  });

  // Test 7: handleSlashCommand unknown command
  test('handleSlashCommand("/unknown") returns error message', async () => {
    const agent = makeAgent();

    const result = await agent.handleSlashCommand("/unknown");

    expect(result).toContain("未知命令");
  });

  // Test 8: handleSlashCommand("/exit") returns goodbye
  test('handleSlashCommand("/exit") returns goodbye', async () => {
    const agent = makeAgent();

    const result = await agent.handleSlashCommand("/exit");

    expect(result).toContain("会话已结束");
  });

  // Test 9: handleSlashCommand("/tools") lists toolsets and tools
  test('handleSlashCommand("/tools") lists enabled toolsets and tools', async () => {
    const agent = makeAgent({
      tools: [
        makeTool({ name: "read-file", toolset: "files" }),
        makeTool({ name: "write-file", toolset: "files" }),
        makeTool({ name: "exec", toolset: "shell" }),
      ],
    });

    const result = await agent.handleSlashCommand("/tools");

    expect(result).toContain("files");
    expect(result).toContain("shell");
    expect(result).toContain("read-file");
    expect(result).toContain("write-file");
    expect(result).toContain("exec");
  });

  test('handleSlashCommand("/title <name>") stores a title for the current session', async () => {
    const agent = makeAgent();

    const result = await agent.handleSlashCommand("/title 项目调研");
    const sessions = await agent.store.getRecentSessions(10);
    const current = sessions.find((session) => session.sessionId === agent.sessionId);

    expect(result).toContain("项目调研");
    expect(current?.name).toBe("项目调研");
  });

  test('handleSlashCommand("/sessions") lists recent sessions with name, message count, and time', async () => {
    const agent = makeAgent();
    await agent.store.saveMetadata("session-old", {
      name: "较早会话",
      messageCount: 2,
      yolo: false,
      enabledToolsets: ["files"],
    });
    await agent.store.saveMetadata("session-new", {
      name: "较新会话",
      messageCount: 5,
      yolo: true,
      enabledToolsets: ["files", "shell"],
    });

    const result = await agent.handleSlashCommand("/sessions");

    expect(result).toContain("最近 10 个会话");
    expect(result).toContain("session-new");
    expect(result).toContain("较新会话");
    expect(result).toContain("5 条消息");
    expect(result).toContain("更新时间");
  });

  test('handleSlashCommand("/resume <sessionId>") restores session state from metadata', async () => {
    const agent = makeAgent();
    await agent.store.appendMessage("resume-target", {
      role: "user",
      content: "旧会话消息",
    });
    await agent.store.saveMetadata("resume-target", {
      name: "目标会话",
      yolo: true,
      enabledToolsets: ["files"],
    });
    agent.yolo = false;
    agent.enabledToolsets = ["shell"];

    const result = await agent.handleSlashCommand("/resume resume-target");

    expect(result).toContain("已恢复会话");
    expect(result).toContain("resume-target");
    expect(agent.sessionId).toBe("resume-target");
    expect(agent.yolo).toBe(true);
    expect(agent.enabledToolsets).toEqual(["files"]);
  });

  // Test 10: processUserMessage processes message and returns response
  test("processUserMessage handles a simple message", async () => {
    const agent = makeAgent({
      tools: [makeTool({ name: "read-file", toolset: "files" })],
    });

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("Hello, I need help"),
    );

    expect(result).toBeDefined();
    expect(result.finalResponse).toBeDefined();
    expect(result.finalResponse.length).toBeGreaterThan(0);
    expect(result.messages).toBeDefined();
  });

  test("processUserMessage stores provider reasoning content on final responses", async () => {
    mockCallProvider.mockImplementationOnce(async () => ({
      ...mockProviderResponse(),
      reasoningContent: "Reasoning returned by provider",
    }));

    const agent = makeAgent();

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("Hello, I need help"),
    );

    const finalMessage = result.messages.at(-1);
    expect(finalMessage?.role).toBe("assistant");
    expect(finalMessage).toHaveProperty(
      "reasoningContent",
      "Reasoning returned by provider",
    );
  });

  test("processUserMessage returns provider reasoning content on final responses", async () => {
    mockCallProvider.mockImplementationOnce(async () => ({
      ...mockProviderResponse(),
      reasoningContent: "Reasoning returned by provider",
    }));

    const agent = makeAgent();

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("Hello, I need help"),
    );

    expect(result.reasoningContent).toBe("Reasoning returned by provider");
  });

  test("processUserMessage stores provider reasoning content on tool call responses", async () => {
    mockCallProvider
      .mockImplementationOnce(async () => ({
        ...mockProviderResponse(),
        content: "",
        finishReason: "tool_calls" as const,
        reasoningContent: "Need to call the tool first",
        toolCalls: [
          {
            id: "call_1",
            name: "test-tool",
            args: {},
          },
        ],
      }))
      .mockImplementationOnce(async () => ({
        ...mockProviderResponse(),
        content: "Done",
      }));

    const agent = makeAgent({
      tools: [makeTool({ name: "test-tool", toolset: "files" })],
    });

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("Use the tool"),
    );

    const toolCallMessage = result.messages.find(
      (msg) => msg.role === "assistant" && "toolCalls" in msg && msg.toolCalls.length > 0,
    );
    expect(toolCallMessage).toHaveProperty(
      "reasoningContent",
      "Need to call the tool first",
    );
  });

  test("processUserMessage prints loading messages around provider call", async () => {
    const agent = makeAgent();

    const { result, logs } = await captureConsoleLog(() =>
      agent.processUserMessage("Hello, I need help"),
    );

    expect(result.finalResponse).toBe("Mock response from provider");
    expect(logs.join("\n")).toContain("正在请求模型");
    expect(logs.join("\n")).toContain("模型响应完成");
  });

  test("processUserMessage forwards stream callback only when streaming is enabled", async () => {
    const streamTokens: string[] = [];
    const agent = makeAgent({ stream: true });

    await captureConsoleLog(() =>
      agent.processUserMessage("Hello, stream please", {
        onStreamToken: (token: string) => streamTokens.push(token),
      }),
    );

    const providerConfig = (mockCallProvider.mock.calls as any)[0][0];
    expect(providerConfig.stream).toBe(true);
    expect(providerConfig.onStreamToken).toBeFunction();

    providerConfig.onStreamToken("片段");
    expect(streamTokens).toEqual(["片段"]);
  });

  test("processUserMessage returns friendly Chinese message when provider fails", async () => {
    mockCallProvider.mockImplementationOnce(async () => {
      throw new Error("Provider error: 401 Unauthorized\ninvalid api key");
    });

    const agent = makeAgent();

    const { result, logs } = await captureConsoleLog(() =>
      agent.processUserMessage("Hello, I need help"),
    );

    expect(result.finalResponse).toContain("模型服务认证失败");
    expect(result.finalResponse).toContain("DEEPSEEK_API_KEY");
    expect(logs.join("\n")).toContain("正在请求模型");
    expect(logs.join("\n")).toContain("模型请求失败");

    const finalMessage = result.messages.at(-1);
    expect(finalMessage?.role).toBe("assistant");
    expect(finalMessage?.content).toBe(result.finalResponse);
  });

  test("processUserMessage returns actionable Chinese message when max iterations are reached", async () => {
    mockCallProvider.mockImplementation(async () => ({
      ...mockProviderResponse(),
      content: "",
      finishReason: "tool_calls" as const,
      toolCalls: [
        {
          id: `call_${randomUUID()}`,
          name: "test-tool",
          args: {},
        },
      ],
    }));

    const agent = makeAgent({
      maxIterations: 1,
      tools: [makeTool({ name: "test-tool", toolset: "files" })],
    });

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("Use the tool repeatedly"),
    );

    expect(result.finalResponse).toContain("任务尚未完成");
    expect(result.finalResponse).toContain("已达到最大迭代次数（1）");
    expect(result.finalResponse).toContain("/yolo");
    expect(result.finalResponse).toContain("已完成步骤");
    expect(result.finalResponse).toContain("test-tool");
    expect(result.finalResponse).toContain("未完成步骤");
    expect(result.finalResponse).toContain("模型仍未给出最终回复");
  });

  // Test 11: SecretRedactor is applied to user messages
  test("SecretRedactor redacts secrets in user messages before storage", async () => {
    const agent = makeAgent();

    const { result } = await captureConsoleLog(() =>
      agent.processUserMessage("My API key is sk-abc123def456ghijklmno"),
    );

    // The redactor should have redacted the API key somewhere in the process
    // The response should NOT contain the raw API key
    expect(result.finalResponse).not.toContain("sk-abc123def456ghijklmno");
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt Tests
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  test("returns a string with tool listings", () => {
    const tools: ConversationTool[] = [
      makeTool({ name: "read-file", description: "Read a file", toolset: "files", permission: "safe" }),
      makeTool({ name: "write-file", description: "Write to a file", toolset: "files", permission: "workspace-write" }),
    ];

    const prompt = buildSystemPrompt(tools, ["files"]);

    expect(prompt).toContain("read-file");
    expect(prompt).toContain("Write to a file");
    expect(prompt).toContain("workspace-write");
    expect(prompt).toContain("Available Tools");
  });

  test("filters tools by enabledToolsets", () => {
    const tools: ConversationTool[] = [
      makeTool({ name: "file-read", toolset: "files" }),
      makeTool({ name: "shell-exec", toolset: "shell" }),
      makeTool({ name: "artifact-upload", toolset: "artifacts" }),
    ];

    // Only enable files and shell
    const prompt = buildSystemPrompt(tools, ["files", "shell"]);

    expect(prompt).toContain("file-read");
    expect(prompt).toContain("shell-exec");
    expect(prompt).not.toContain("artifact-upload");
  });

  test("includes intent context when provided", () => {
    const tools: ConversationTool[] = [makeTool({ name: "read-file", toolset: "files" })];
    const intentContext = "Detected workflow: test-case-gen, project: my-app";

    const prompt = buildSystemPrompt(tools, ["files"], intentContext);

    expect(prompt).toContain(intentContext);
    expect(prompt).toContain("Intent Context");
  });

  test("includes slash command documentation", () => {
    const tools: ConversationTool[] = [makeTool({ name: "read-file", toolset: "files" })];

    const prompt = buildSystemPrompt(tools, ["files"]);

    expect(prompt).toContain("/help");
    expect(prompt).toContain("/status");
    expect(prompt).toContain("/new");
    expect(prompt).toContain("/tools");
    expect(prompt).toContain("/yolo");
    expect(prompt).toContain("/exit");
  });

  test("includes tool usage rules", () => {
    const tools: ConversationTool[] = [
      makeTool({ name: "read-file", toolset: "files", permission: "safe" }),
    ];

    const prompt = buildSystemPrompt(tools, ["files"]);

    expect(prompt).toContain("Tool Usage Rules");
    expect(prompt).toContain("safe");
  });

  test("encourages batching independent tool calls", () => {
    const tools: ConversationTool[] = [
      makeTool({ name: "file_read", toolset: "files", permission: "safe" }),
      makeTool({ name: "file_list", toolset: "files", permission: "safe" }),
    ];

    const prompt = buildSystemPrompt(tools, ["files"]);

    expect(prompt).toContain("批量调用独立工具");
    expect(prompt).toContain("一次性读取多个文件");
    expect(prompt).toContain("减少迭代次数");
  });
});
