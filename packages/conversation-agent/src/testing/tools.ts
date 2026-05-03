import type {
  ConversationTool,
  ToolContext,
  ToolPermission,
  ToolResult,
  ToolsetName,
} from "../types";

export type TestingToolName =
  | "test.run"
  | "test.gen_cases"
  | "test.scan"
  | "test.report"
  | "test.export_xmind"
  | "test.prepare_env"
  | "test.session";

export type TestingActionId =
  | "playwright.runPlan"
  | "playwright.runPlan.real"
  | "staticScan.scanDiff"
  | "xmind.export"
  | "report.generateHtmlReport"
  | "report.generateAllureReport"
  | "zentao.syncIssue"
  | "lanhu.fetchRequirement"
  | "knowledge.consult"
  | "skill.test-case-gen"
  | "skill.ui-script-gen"
  | "session.save"
  | "session.resume"
  | "session.summary"
  | "session.list";

export interface TestingActionBridge {
  executeAction(
    actionId: TestingActionId,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;
}

export interface TestingToolDefinition extends ConversationTool {
  name: TestingToolName;
  permission: ToolPermission;
  toolset: ToolsetName;
}

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: true };
}

function isPlaywrightScript(input: Record<string, unknown>): boolean {
  return input.format === "playwright-script" || input.kind === "ui-script";
}

function sessionAction(input: Record<string, unknown>): TestingActionId {
  const action = String(input.action ?? "summary");
  if (action === "save") return "session.save";
  if (action === "resume") return "session.resume";
  if (action === "list") return "session.list";
  return "session.summary";
}

function makeTool(input: {
  name: TestingToolName;
  description: string;
  permission: ToolPermission;
  inputSchema: Record<string, unknown>;
  actionId: (input: Record<string, unknown>) => TestingActionId;
  bridge: TestingActionBridge;
}): TestingToolDefinition {
  return {
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    permission: input.permission,
    toolset: "qa-workflows",
    execute: async (toolInput, context) =>
      input.bridge.executeAction(input.actionId(toolInput), toolInput, context),
  };
}

export function createTestingTools(bridge: TestingActionBridge): TestingToolDefinition[] {
  return [
    makeTool({
      name: "test.run",
      description: "Run a testing plan or targeted regression through Playwright action IDs.",
      permission: "command",
      inputSchema: schema({
        target: { type: "string" },
        mode: { type: "string", enum: ["mock", "real"] },
      }),
      actionId: (input) =>
        input.mode === "real" ? "playwright.runPlan.real" : "playwright.runPlan",
      bridge,
    }),
    makeTool({
      name: "test.gen_cases",
      description: "Generate test cases or UI scripts through skill action IDs.",
      permission: "workspace-write",
      inputSchema: schema({
        source: { type: "string" },
        format: { type: "string" },
      }),
      actionId: (input) =>
        isPlaywrightScript(input) ? "skill.ui-script-gen" : "skill.test-case-gen",
      bridge,
    }),
    makeTool({
      name: "test.scan",
      description: "Run static test/workspace risk scanning.",
      permission: "safe",
      inputSchema: schema({ target: { type: "string" } }),
      actionId: () => "staticScan.scanDiff",
      bridge,
    }),
    makeTool({
      name: "test.report",
      description: "Generate local reports, or explicitly sync an issue when requested.",
      permission: "workspace-write",
      inputSchema: schema({
        format: { type: "string", enum: ["html", "allure", "zentao"] },
      }),
      actionId: (input) => {
        if (input.format === "allure") return "report.generateAllureReport";
        if (input.format === "zentao") return "zentao.syncIssue";
        return "report.generateHtmlReport";
      },
      bridge,
    }),
    makeTool({
      name: "test.export_xmind",
      description: "Export testing points or cases to XMind.",
      permission: "workspace-write",
      inputSchema: schema({ title: { type: "string" } }),
      actionId: () => "xmind.export",
      bridge,
    }),
    makeTool({
      name: "test.prepare_env",
      description: "Fetch or prepare requirement/testing context before execution.",
      permission: "external",
      inputSchema: schema({ sourceUrl: { type: "string" } }),
      actionId: () => "lanhu.fetchRequirement",
      bridge,
    }),
    makeTool({
      name: "test.session",
      description: "Save, resume, list, or summarize testing session context.",
      permission: "safe",
      inputSchema: schema({
        action: { type: "string", enum: ["save", "resume", "summary", "list"] },
        sessionId: { type: "string" },
      }),
      actionId: sessionAction,
      bridge,
    }),
  ];
}
