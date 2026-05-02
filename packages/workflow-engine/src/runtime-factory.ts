import {
  AgentRunner,
  MockProvider,
  OpenAICompatibleProvider,
  ProviderRegistry,
  type AgentManifest,
} from "../../agent-runner/src/index";
import { featureDir } from "../../artifact-repo/src/index";
import { LocalConfigLoader } from "../../core/src/index";
import type {
  IssueDraft,
  LanhuFetchInput,
  LanhuWritebackDraft,
  NotificationRequest,
  PlaywrightRealOptions,
  RequirementDraft,
  RequirementSpec,
  RunRecord,
  RunPlan,
  TestSpec,
} from "../../domain/src/index";
import {
  consultKnowledge,
  proposeKnowledge,
} from "../../knowledge-repo/src/index";
import { PluginActionRegistry } from "../../plugin-runtime/src/index";
import { fetchLanhuRequirement } from "../../../plugins/lanhu/src/real";
import { mockFetchRequirement } from "../../../plugins/lanhu/src/mock";
import { mockWriteLanhuRequirement } from "../../../plugins/lanhu-writeback/src/mock";
import { writeLanhuRequirement } from "../../../plugins/lanhu-writeback/src/real";
import { exportXMindFile } from "../../../plugins/xmind/src/exporter";
import { mockExportXMind } from "../../../plugins/xmind/src/mock";
import { mockRunPlan } from "../../../plugins/playwright/src/mock";
import { executeRunPlan } from "../../../plugins/playwright/src/real";
import { selfHealingRun } from "../../../plugins/playwright/src/self-heal";
import { sendDingTalkNotification } from "../../../plugins/notify/src/dingtalk";
import { sendNotification } from "../../../plugins/notify/src/mock";
import { generateAllureReport } from "../../../plugins/report/src/allure";
import { writeHtmlReport } from "../../../plugins/report/src/html-renderer";
import { mockSyncIssueToZentao } from "../../../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../../../plugins/zentao/src/real";
import { WorkflowExecutor } from "./executor";

export interface RuntimeFactoryOptions {
  rootDir: string;
  mode: "mock" | "real";
  browserType?: PlaywrightRealOptions["browserType"];
  requireProviderConfig?: boolean;
  notifyMode?: "mock" | "real" | "off";
}

function agent(
  name: string,
  inputSchema: string,
  outputSchema: string,
): AgentManifest {
  return {
    name,
    title: name,
    version: "0.1.0",
    inputSchema,
    outputSchema,
    ownerSkill: "test-case-gen",
    promptPath: "prompt.md",
  };
}

function createMockAgentResponses(): Record<string, string> {
  return {
    "source-normalizer": JSON.stringify({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      facts: [
        {
          id: "FACT-001",
          content: "用户需要创建规则。",
          sourceRefs: ["SRC-001"],
        },
      ],
    }),
    "requirement-analyst": JSON.stringify({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      gaps: [
        {
          id: "GAP-001",
          category: "ui-copy",
          severity: "P0",
          evidence: "缺少保存按钮文案",
          impact: "影响测试断言",
          question: "保存按钮文案是什么?",
          sourceRefs: ["SRC-001"],
        },
      ],
    }),
    "clarification-drafter": JSON.stringify({
      schemaVersion: "0.1",
      summary: "需要确认保存按钮文案。",
      questions: [
        {
          id: "GAP-001",
          severity: "P0",
          category: "ui-copy",
          question: "保存按钮文案是什么?",
          impact: "影响测试断言",
          requiresProductAnswer: true,
        },
      ],
      assumptions: [],
    }),
    "requirement-author": JSON.stringify({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [
        {
          id: "REQ-001",
          text: "保存按钮文案为保存，保存成功后展示成功提示。",
          severity: "P0",
          sourceType: "confirmation",
          sourceRefs: ["SRC-001"],
          confirmationQuestionId: "GAP-001",
        },
      ],
      pageContracts: [
        { id: "PAGE-001", name: "规则配置", surface: "web" },
      ],
      openItems: [],
      assumptions: [],
    }),
    "test-point-designer": JSON.stringify({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      points: [
        {
          id: "TP-001",
          title: "创建规则成功提示",
          priority: "P0",
          requirementRefs: ["REQ-001"],
          risk: "high",
        },
      ],
    }),
    "test-spec-author": JSON.stringify({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置测试规格",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: [
        {
          id: "M-001",
          name: "规则创建",
          requirementRefs: ["REQ-001"],
          cases: [
            {
              id: "TC-001",
              title: "创建规则后展示成功提示",
              priority: "P0",
              requirementRefs: ["REQ-001"],
              steps: [
                {
                  id: "STEP-001",
                  action: "点击保存按钮",
                  expected: "保存成功",
                  requirementRefs: ["REQ-001"],
                },
              ],
              assertions: [
                {
                  id: "ASSERT-001",
                  layer: "L3",
                  kind: "ui-copy",
                  target: "成功提示",
                  expected: "保存成功",
                  requirementRefs: ["REQ-001"],
                },
              ],
              automation: {
                surface: "web",
                readiness: "ready",
                uiContractRefs: ["PAGE-001"],
                blockers: [],
              },
              traceability: {
                requirementRefs: ["REQ-001"],
                sourceRefs: ["SRC-001"],
              },
            },
          ],
        },
      ],
    }),
    "test-spec-reviewer": JSON.stringify({
      schemaVersion: "0.1",
      passed: true,
      violations: [],
    }),
  };
}

function createAgentManifestMap(): Map<string, AgentManifest> {
  return new Map([
    [
      "source-normalizer",
      agent("source-normalizer", "RequirementSourceBundle", "RequirementDraft"),
    ],
    [
      "requirement-analyst",
      agent("requirement-analyst", "RequirementAnalysisInput", "RequirementGapReport"),
    ],
    [
      "clarification-drafter",
      agent("clarification-drafter", "RequirementGapReport", "ClarificationDossier"),
    ],
    [
      "requirement-author",
      agent("requirement-author", "RequirementAuthorInput", "RequirementSpec"),
    ],
    [
      "test-point-designer",
      agent("test-point-designer", "RequirementSpec", "TestPointSet"),
    ],
    [
      "test-spec-author",
      agent("test-spec-author", "TestSpecAuthorInput", "TestSpec"),
    ],
    [
      "test-spec-reviewer",
      agent("test-spec-reviewer", "TestSpecReviewerInput", "ReviewReport"),
    ],
  ]);
}

function parseTrustedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function createRuntimeServices(options: RuntimeFactoryOptions): {
  executor: WorkflowExecutor;
} {
  const providers = new ProviderRegistry();
  const actions = new PluginActionRegistry();
  const config = new LocalConfigLoader({ rootDir: options.rootDir });
  const browserType = options.browserType ?? "chromium";
  const notifyMode = options.notifyMode ?? "mock";
  const requireProviderConfig =
    options.requireProviderConfig ?? options.mode === "real";

  const registerNotifyAction = () => {
    if (notifyMode === "off") {
      actions.register("notify.sendNotification", (input) =>
        sendNotification({
          ...(input as NotificationRequest),
          dryRun: true,
        }),
      );
      return;
    }
    if (notifyMode === "real") {
      actions.register("notify.sendNotification", (input) =>
        sendDingTalkNotification(input as NotificationRequest, {
          webhookUrl: config.resolveSecret("DINGTALK_WEBHOOK_URL"),
          secret: config.resolveSecret("DINGTALK_SECRET"),
        }),
      );
      return;
    }
    actions.register("notify.sendNotification", (input) =>
      sendNotification(input as NotificationRequest),
    );
  };

  if (options.mode === "mock") {
    providers.register(new MockProvider(createMockAgentResponses()));
    actions.register("lanhu.fetchRequirement", (input) =>
      mockFetchRequirement(input as LanhuFetchInput),
    );
    actions.register("xmind.export", (input) =>
      mockExportXMind(input as TestSpec),
    );
    actions.register("playwright.runPlan", (input, context) =>
      mockRunPlan(input as RunPlan, context),
    );
    actions.register("report.generateHtmlReport", (input, context) =>
      writeHtmlReport(input as RunRecord, featureDir(context)),
    );
    actions.register("report.generateAllureReport", (input, context) =>
      generateAllureReport(input as RunRecord, featureDir(context)),
    );
    registerNotifyAction();
    actions.register("zentao.syncIssue", (input) =>
      mockSyncIssueToZentao(input as IssueDraft, {
        dryRun: true,
      }),
    );
    actions.register("lanhuWriteback.writeRequirement", (input) =>
      mockWriteLanhuRequirement(input as LanhuWritebackDraft, {
        dryRun: true,
      }),
    );
  } else {
    const baseUrl = config.resolveSecret("KATA_AGENT_PROVIDER_BASE_URL");
    const apiKey = config.resolveSecret("KATA_AGENT_PROVIDER_API_KEY");
    const model = config.resolveSecret("KATA_AGENT_PROVIDER_MODEL");
    if (baseUrl && apiKey && model) {
      providers.register(
        new OpenAICompatibleProvider({
          id: "openai-compatible",
          baseUrl,
          apiKey,
          model,
        }),
      );
    } else if (requireProviderConfig) {
      throw new Error("MISSING_SECRET provider config");
    }
    actions.register("lanhu.fetchRequirement", (input, context) =>
      fetchLanhuRequirement(input as LanhuFetchInput, {
        ...context,
        cookie: config.resolveSecret("LANHU_COOKIE"),
      }),
    );
    actions.register("xmind.export", (input, context) =>
      exportXMindFile(input as TestSpec, featureDir(context)),
    );
    actions.register("playwright.runPlan", async (input, context) => {
      const realOptions: PlaywrightRealOptions = {
        browserType,
        headless: true,
        screenshotOnFailure: true,
        screenshotOnPass: false,
        collectConsoleLogs: true,
        timeout: 30000,
        retryCount: 3,
      };
      const result = await selfHealingRun(
        input as RunPlan,
        realOptions,
        featureDir(context),
        executeRunPlan,
        { maxAttempts: realOptions.retryCount, backoffMs: 50 },
      );
      return result.record;
    });
    actions.register("report.generateHtmlReport", (input, context) =>
      writeHtmlReport(input as RunRecord, featureDir(context)),
    );
    actions.register("report.generateAllureReport", (input, context) =>
      generateAllureReport(input as RunRecord, featureDir(context)),
    );
    registerNotifyAction();
    actions.register("zentao.syncIssue", (input) =>
      syncIssueToZentao(input as IssueDraft, {
        baseUrl: config.resolveSecret("ZENTAO_BASE_URL"),
        token: config.resolveSecret("ZENTAO_TOKEN"),
        dryRun: false,
      }),
    );
    actions.register("lanhuWriteback.writeRequirement", (input) =>
      writeLanhuRequirement(input as LanhuWritebackDraft, {
        cookie: config.resolveSecret("LANHU_WRITEBACK_COOKIE"),
        trustedDomains: parseTrustedDomains(
          config.resolveSecret("LANHU_WRITEBACK_ALLOWED_HOSTS"),
        ),
        dryRun: false,
      }),
    );
  }

  actions.register("knowledge.consult", (input) =>
    consultKnowledge(input as RequirementDraft),
  );
  actions.register("knowledge.propose", (input, context) =>
    proposeKnowledge(input as RequirementSpec, context.rootDir),
  );

  return {
    executor: new WorkflowExecutor({
      agentRunner: new AgentRunner(providers),
      actions,
      agents: createAgentManifestMap(),
    }),
  };
}
