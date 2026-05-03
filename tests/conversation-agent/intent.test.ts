import { describe, expect, test } from "bun:test";
import { IntentBias } from "../../packages/conversation-agent/src/intent";

// ---------------------------------------------------------------------------
// IntentBias — Unit Tests
// ---------------------------------------------------------------------------

describe("IntentBias", () => {
  const analyzer = new IntentBias();

  // -----------------------------------------------------------------------
  // Test 1: Detect workflow intent from "帮我生成测试用例..."
  // -----------------------------------------------------------------------
  test("detects test-case-gen workflow from 测试用例 keyword", () => {
    const result = analyzer.analyze("帮我生成测试用例 for login page");
    expect(result.workflow).toBe("test-case-gen");
  });

  test("detects test-case-gen workflow from 'test case' keyword", () => {
    const result = analyzer.analyze("Please generate test cases for the API");
    expect(result.workflow).toBe("test-case-gen");
  });

  test("detects bug-report-gen workflow from bug keyword", () => {
    const result = analyzer.analyze("帮我创建一个 bug report");
    expect(result.workflow).toBe("bug-report-gen");
  });

  test("detects bug-report-gen workflow from 缺陷 keyword", () => {
    const result = analyzer.analyze("这个缺陷需要报告");
    expect(result.workflow).toBe("bug-report-gen");
  });

  test("detects requirement-spec-gen workflow from 需求 keyword", () => {
    const result = analyzer.analyze("帮我写一份需求文档");
    expect(result.workflow).toBe("requirement-spec-gen");
  });

  test("detects requirement-spec-gen workflow from requirement keyword", () => {
    const result = analyzer.analyze("Write a requirement specification");
    expect(result.workflow).toBe("requirement-spec-gen");
  });

  test("detects test-run workflow from regression wording", () => {
    const result = analyzer.analyze("帮我跑一下登录模块的回归测试");

    expect(result.workflow).toBe("test-run");
    expect(result.feature).toBe("登录");
  });

  test("detects static scan workflow", () => {
    const result = analyzer.analyze("扫描这个分支的测试风险");

    expect(result.workflow).toBe("test-scan");
  });

  test("detects report workflow", () => {
    const result = analyzer.analyze("整理这次执行的测试报告");

    expect(result.workflow).toBe("test-report");
  });

  // -----------------------------------------------------------------------
  // Test 2: Detect resume intent from "继续刚才 rule-config 那个任务"
  // -----------------------------------------------------------------------
  test("detects resume intent from 继续 prefix", () => {
    const result = analyzer.analyze("继续刚才 rule-config 那个任务");
    expect(result.isResume).toBe(true);
  });

  test("detects resume intent from 'resume' prefix", () => {
    const result = analyzer.analyze("resume the previous task");
    expect(result.isResume).toBe(true);
  });

  test("detects resume intent from 继续刚才 prefix", () => {
    const result = analyzer.analyze("继续刚才生成测试用例的任务");
    expect(result.isResume).toBe(true);
  });

  test("detects resume intent from 接着 prefix", () => {
    const result = analyzer.analyze("接着刚才的工作");
    expect(result.isResume).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Test 3: Detect external effects from "把这个 issue 同步到禅道"
  // -----------------------------------------------------------------------
  test("detects external effects from 同步 keyword", () => {
    const result = analyzer.analyze("把这个 issue 同步到禅道");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from sync keyword", () => {
    const result = analyzer.analyze("Please sync this with the remote system");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from 禅道 keyword", () => {
    const result = analyzer.analyze("把这个 bug 同步到禅道");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from zentao keyword", () => {
    const result = analyzer.analyze("Update zentao with this issue");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from 钉钉 keyword", () => {
    const result = analyzer.analyze("发送通知到钉钉");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from dingtalk keyword", () => {
    const result = analyzer.analyze("Notify via dingtalk");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from 蓝湖写回 keyword", () => {
    const result = analyzer.analyze("把这个设计蓝湖写回到项目");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("detects external effects from writeback keyword", () => {
    const result = analyzer.analyze("writeback to the design system");
    expect(result.hasExternalEffects).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Test 4: Return empty analysis for non-workflow queries
  // -----------------------------------------------------------------------
  test("returns { workflow: undefined } for non-workflow queries", () => {
    const result = analyzer.analyze("整理项目资料");
    expect(result.workflow).toBeUndefined();
  });

  test("returns { workflow: undefined } for general chat", () => {
    const result = analyzer.analyze("今天天气怎么样？");
    expect(result.workflow).toBeUndefined();
  });

  test("returns { workflow: undefined } for unrelated English queries", () => {
    const result = analyzer.analyze("What is the capital of France?");
    expect(result.workflow).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Additional: Project extraction
  // -----------------------------------------------------------------------
  test("extracts project name after 项目 keyword", () => {
    const result = analyzer.analyze("请为项目 AlphaGo 生成测试用例");
    expect(result.project).toBe("AlphaGo");
  });

  test("extracts project up to 20 chars", () => {
    const result = analyzer.analyze("关于项目 very-long-project-name-here 的需求");
    expect(result.project).toBe("very-long-project-na");
  });

  // -----------------------------------------------------------------------
  // Additional: Feature extraction
  // -----------------------------------------------------------------------
  test("extracts feature name after 功能 keyword", () => {
    const result = analyzer.analyze("登录功能生成测试用例");
    expect(result.feature).toBe("登录");
  });

  test("extracts feature name after 'feature' keyword", () => {
    const result = analyzer.analyze("Generate tests for feature user-authentication");
    expect(result.feature).toBe("user-authentication");
  });

  test("extracts feature up to 30 chars", () => {
    const result = analyzer.analyze("测试功能 this-is-a-very-long-feature-name-that-exceeds-thirty");
    expect(result.feature?.length).toBeLessThanOrEqual(30);
  });

  // -----------------------------------------------------------------------
  // Additional: URL extraction
  // -----------------------------------------------------------------------
  test("extracts http URL from text", () => {
    const result = analyzer.analyze("See http://example.com/issue/123 for details");
    expect(result.sourceUrl).toBe("http://example.com/issue/123");
  });

  test("extracts https URL from text", () => {
    const result = analyzer.analyze("Bug at https://github.com/org/repo/issues/42");
    expect(result.sourceUrl).toBe("https://github.com/org/repo/issues/42");
  });

  // -----------------------------------------------------------------------
  // Combined scenarios
  // -----------------------------------------------------------------------
  test("combines workflow + external effects", () => {
    const result = analyzer.analyze("把这个 bug report 同步到禅道");
    expect(result.workflow).toBe("bug-report-gen");
    expect(result.hasExternalEffects).toBe(true);
  });

  test("combines resume + workflow + project", () => {
    const result = analyzer.analyze("继续刚才项目 my-app 的测试用例生成");
    expect(result.isResume).toBe(true);
    expect(result.workflow).toBe("test-case-gen");
    expect(result.project).toBe("my-app");
  });
});
