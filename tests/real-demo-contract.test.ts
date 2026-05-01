import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";

const repoRoot = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function providerContentByPhase(): Record<string, unknown[]> {
  return {
    start: [
      {
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
      },
      {
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
      },
      {
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
      },
    ],
    resume: [
      {
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
      },
      {
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
      },
      {
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
      },
      {
        schemaVersion: "0.1",
        passed: true,
        violations: [],
      },
    ],
  };
}

async function writeFetchPreload(rootDir: string): Promise<string> {
  const preloadPath = join(rootDir, "real-demo-fetch-preload.js");
  await Bun.write(
    preloadPath,
    `
const providerContentByPhase = ${JSON.stringify(providerContentByPhase())};
const providerIndexes = { start: 0, resume: 0 };

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url === "https://lanhu.example/prd") {
    return new Response(
      "<!doctype html><html><body><h1>规则配置</h1><p>用户需要创建规则。</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    );
  }
  if (url === "https://provider.example/v1/chat/completions") {
    const phase = process.env.KATA_AGENT_REAL_DEMO_PHASE;
    const content = providerContentByPhase[phase]?.[providerIndexes[phase]++];
    if (!content) {
      return new Response("Missing provider fixture for phase " + phase, { status: 500 });
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  }
  throw new Error("Unexpected fetch URL: " + url);
};
`,
  );
  return preloadPath;
}

function realModeEnv(
  preloadPath: string,
  phase: "start" | "resume",
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BUN_OPTIONS: `--preload=${preloadPath}`,
    KATA_AGENT_PROVIDER_BASE_URL: "https://provider.example/v1",
    KATA_AGENT_PROVIDER_API_KEY: "test-provider-key",
    KATA_AGENT_PROVIDER_MODEL: "test-model",
    KATA_AGENT_REAL_DEMO_PHASE: phase,
    LANHU_COOKIE: "",
  };
}

describe("real demo contract", () => {
  test("runs real-mode demo with injected Lanhu and provider fetches", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-real-demo-"));
    roots.push(rootDir);
    const preloadPath = await writeFetchPreload(rootDir);

    const start = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "test-case-gen",
        "--mode",
        "real",
        "--project",
        "demo",
        "--feature",
        "rule-config",
        "--source-url",
        "https://lanhu.example/prd",
        "--root",
        rootDir,
      ],
      {
        cwd: repoRoot,
        env: realModeEnv(preloadPath, "start"),
        stderr: "pipe",
      },
    );
    const started = JSON.parse(await new Response(start.stdout).text()) as {
      runId: string;
      status: string;
      currentNode: string;
    };
    const startError = await new Response(start.stderr).text();
    expect(await start.exited, startError).toBe(0);
    expect(started.status).toBe("waiting");
    expect(started.currentNode).toBe("await-confirmation-result");

    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    expect(existsSync(join(dir, "sources/lanhu/raw.html"))).toBe(true);
    expect(
      existsSync(join(dir, "requirement/clarifications/confirmation-draft.md")),
    ).toBe(true);

    const confirmationPath = join(rootDir, "confirmation-result.json");
    await Bun.write(
      confirmationPath,
      JSON.stringify({
        schemaVersion: "0.1",
        answers: [
          { questionId: "GAP-001", status: "confirmed", answer: "保存" },
        ],
      }),
    );
    const imported = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "confirmation",
        "import",
        "--feature-dir",
        dir,
        "--run",
        started.runId,
        "--file",
        confirmationPath,
        "--project",
        "demo",
        "--feature",
        "rule-config",
      ],
      { cwd: repoRoot, stderr: "pipe" },
    );
    const importError = await new Response(imported.stderr).text();
    expect(await imported.exited, importError).toBe(0);

    const resume = Bun.spawn(
      [
        "bun",
        "apps/cli/src/index.ts",
        "workflow",
        "resume",
        "--mode",
        "real",
        "--feature-dir",
        dir,
        "--run",
        started.runId,
      ],
      {
        cwd: repoRoot,
        env: realModeEnv(preloadPath, "resume"),
        stderr: "pipe",
      },
    );
    const resumed = JSON.parse(await new Response(resume.stdout).text()) as {
      status: string;
    };
    const resumeError = await new Response(resume.stderr).text();
    expect(await resume.exited, resumeError).toBe(0);
    expect(resumed.status).toBe("succeeded");

    for (const path of [
      "requirement/spec/requirement-spec.json",
      "test-spec/test-spec.json",
      "test-spec/review-report.json",
      "exports/xmind/xmind-export.json",
      "exports/xmind/test-spec.xmind",
      "reports/design-report.md",
      `traces/${started.runId}.jsonl`,
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }

    const xmind = await JSZip.loadAsync(
      readFileSync(join(dir, "exports/xmind/test-spec.xmind")),
    );
    expect(xmind.file("content.json")).not.toBeNull();
  });
});
