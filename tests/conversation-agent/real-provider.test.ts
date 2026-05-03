// Real provider integration test — calls actual DeepSeek API
import { describe, expect, test } from "bun:test";
import { callProvider } from "../../packages/conversation-agent/src/provider";
import type { ChatMessage } from "../../packages/conversation-agent/src/types";

const hasApiKey = !!process.env.DEEPSEEK_API_KEY;

const config = {
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  temperature: 0.7,
  maxTokens: 1024,
  contextLength: 1_048_576,
};

describe.skipIf(!hasApiKey)("Real DeepSeek Provider", () => {
  test("simple chat completion", async () => {
    const sysPrompt = "You are a helpful assistant. Keep responses under 50 chars.";
    const messages: ChatMessage[] = [{ role: "user", content: "Say hello" }];
    const result = await callProvider(config, sysPrompt, messages);
    console.log("Content:", result.content);
    console.log("Tokens:", result.inputTokens, "in,", result.outputTokens, "out");
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.finishReason).toBe("stop");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.toolCalls).toBeUndefined();
  }, 30000);

  test("file_list tool call", async () => {
    const sysPrompt =
      "You have access to file_list tool. When asked to list files, call it. Do not respond with text.";
    const messages: ChatMessage[] = [{ role: "user", content: "List root dir" }];
    const tools = [{
      type: "function",
      function: {
        name: "file_list",
        description: "List files in a dir",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    }];
    const result = await callProvider(config, sysPrompt, messages, tools);
    console.log("Content:", result.content);
    console.log("Tool calls:", JSON.stringify(result.toolCalls));
    console.log("Finish reason:", result.finishReason);
    if (result.toolCalls && result.toolCalls.length > 0) {
      expect(result.toolCalls[0].name).toBe("file_list");
      expect(result.toolCalls[0].args).toHaveProperty("path");
      expect(result.finishReason).toBe("tool_calls");
    } else {
      expect(result.content.length).toBeGreaterThan(0);
    }
    expect(result.inputTokens).toBeGreaterThan(0);
  }, 30000);

  test("shell_exec tool call", async () => {
    const sysPrompt =
      "You have access to shell_exec tool. When asked to run commands, call it. Do not respond with text.";
    const messages: ChatMessage[] = [{ role: "user", content: "Run ls -la" }];
    const tools = [{
      type: "function",
      function: {
        name: "shell_exec",
        description: "Execute shell command",
        parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      },
    }];
    const result = await callProvider(config, sysPrompt, messages, tools);
    console.log("Content:", result.content);
    console.log("Tool calls:", JSON.stringify(result.toolCalls));
    console.log("Finish reason:", result.finishReason);
    if (result.toolCalls && result.toolCalls.length > 0) {
      expect(result.toolCalls[0].name).toBe("shell_exec");
      expect(result.toolCalls[0].args).toHaveProperty("command");
      expect(result.finishReason).toBe("tool_calls");
    } else {
      expect(result.content.length).toBeGreaterThan(0);
    }
    expect(result.inputTokens).toBeGreaterThan(0);
  }, 30000);
});
