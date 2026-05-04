// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — workflow-tools, artifact-tools, and
// knowledge-tools tests
// ---------------------------------------------------------------------------
import { describe, expect, test } from "bun:test";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";

import {
  createWorkflowTools,
  type WorkflowToolController,
} from "../../packages/conversation-agent/src/tools/workflow-tools";
import { createArtifactTools } from "../../packages/conversation-agent/src/tools/artifact-tools";
import { createKnowledgeTools } from "../../packages/conversation-agent/src/tools/knowledge-tools";

// ---------------------------------------------------------------------------
// Test context (minimal — these tools don't actually use workspaceRoot)
// ---------------------------------------------------------------------------

const ctx: ToolContext = {
  workspaceRoot: "/tmp/test-workspace",
  sessionId: "test-session",
  yolo: false,
  env: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(r: ToolResult): asserts r is { ok: true; summary: string; data?: unknown } {
  expect(r.ok).toBe(true);
}

function fail(
  r: ToolResult,
): asserts r is {
  ok: false;
  summary: string;
  error: { code: string; retryable: boolean; message: string };
} {
  expect(r.ok).toBe(false);
  expect(r.error).toBeObject();
}

// ===========================================================================
// Workflow Tools
// ===========================================================================

describe("workflow tools", () => {
  const controller: WorkflowToolController = {
    async start(input) {
      return {
        runId: input.runId ?? "run-1",
        workflowName: input.workflowName,
        status: "waiting",
        currentNode: "await-confirmation-result",
        project: input.project,
        feature: input.feature,
      };
    },
    async status(input) {
      return {
        runId: input.runId,
        workflowName: "test-case-gen",
        status: "waiting",
        currentNode: "await-confirmation-result",
        project: input.project,
        feature: input.feature,
      };
    },
    async resume(input) {
      return {
        runId: input.runId,
        workflowName: "test-case-gen",
        status: "succeeded",
        project: input.project,
        feature: input.feature,
      };
    },
    async findRuns(input) {
      return {
        runs: [
          {
            runId: "run-1",
            workflowName: input.workflowName ?? "test-case-gen",
            status: "succeeded",
            project: input.project,
            feature: "rule-config",
          },
        ],
      };
    },
  };
  const tools = createWorkflowTools(controller);

  test("createWorkflowTools returns an object with four tools", () => {
    expect(tools).toHaveProperty("workflow_start");
    expect(tools).toHaveProperty("workflow_status");
    expect(tools).toHaveProperty("workflow_resume");
    expect(tools).toHaveProperty("workflow_find_runs");
  });

  test("tools have correct names", () => {
    expect(tools.workflow_start.name).toBe("workflow_start");
    expect(tools.workflow_status.name).toBe("workflow_status");
    expect(tools.workflow_resume.name).toBe("workflow_resume");
    expect(tools.workflow_find_runs.name).toBe("workflow_find_runs");
  });

  test("tools have correct permissions (all safe)", () => {
    expect(tools.workflow_start.permission).toBe("safe");
    expect(tools.workflow_status.permission).toBe("safe");
    expect(tools.workflow_resume.permission).toBe("safe");
    expect(tools.workflow_find_runs.permission).toBe("safe");
  });

  test("tools have correct toolset", () => {
    expect(tools.workflow_start.toolset).toBe("qa-workflows");
    expect(tools.workflow_status.toolset).toBe("qa-workflows");
    expect(tools.workflow_resume.toolset).toBe("qa-workflows");
    expect(tools.workflow_find_runs.toolset).toBe("qa-workflows");
  });

  test("tools have descriptions and inputSchema", () => {
    for (const key of ["workflow_start", "workflow_status", "workflow_resume", "workflow_find_runs"]) {
      const t = (tools as Record<string, typeof tools.workflow_start>)[key];
      expect(t.description).toBeString();
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeObject();
    }
  });

  // ---- workflow.start ----

  test("workflow.start delegates to controller with just workflowName", async () => {
    const result = await tools.workflow_start.execute(
      { workflowName: "test-case-gen" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/Started workflow test-case-gen/i);
    expect((result.data as Record<string, unknown>)?.runId).toBeString();
    expect((result.data as Record<string, unknown>)?.workflowName).toBe("test-case-gen");
  });

  test("workflow.start accepts optional project, feature, sourceUrl", async () => {
    const result = await tools.workflow_start.execute(
      {
        workflowName: "test-case-gen",
        project: "kata-agent",
        feature: "feat/nl-runtime",
        sourceUrl: "https://github.com/example/pr/42",
      },
      ctx,
    );
    ok(result);
    expect((result.data as Record<string, unknown>)?.workflowName).toBe("test-case-gen");
  });

  test("workflow.start returns error when workflowName is missing", async () => {
    const result = await tools.workflow_start.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- workflow.status ----

  test("workflow.status delegates to controller", async () => {
    const result = await tools.workflow_status.execute(
      { runId: "run-1" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/Status for run run-1: waiting/i);
  });

  test("workflow.status returns error when runId is missing", async () => {
    const result = await tools.workflow_status.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- workflow.resume ----

  test("workflow.resume delegates to controller", async () => {
    const result = await tools.workflow_resume.execute(
      { runId: "run-1" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/resumed with status: succeeded/i);
  });

  test("workflow.resume returns error when runId is missing", async () => {
    const result = await tools.workflow_resume.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- workflow.find_runs ----

  test("workflow.find_runs delegates to controller", async () => {
    const result = await tools.workflow_find_runs.execute(
      { project: "kata-agent" },
      ctx,
    );
    ok(result);
    expect(Array.isArray((result.data as Record<string, unknown>)?.runs)).toBe(true);
  });

  test("workflow.find_runs works without optional params", async () => {
    const result = await tools.workflow_find_runs.execute({}, ctx);
    ok(result);
  });

  test("workflow tools report not wired when no controller is injected", async () => {
    const unwired = createWorkflowTools();
    const result = await unwired.workflow_start.execute(
      { workflowName: "test-case-gen" },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("ACTION_NOT_WIRED");
  });
});

// ===========================================================================
// Artifact Tools
// ===========================================================================

describe("artifact tools", () => {
  const tools = createArtifactTools();

  test("createArtifactTools returns an object with three tools", () => {
    expect(tools).toHaveProperty("artifact_list");
    expect(tools).toHaveProperty("artifact_read");
    expect(tools).toHaveProperty("artifact_summarize");
  });

  test("tools have correct names", () => {
    expect(tools.artifact_list.name).toBe("artifact_list");
    expect(tools.artifact_read.name).toBe("artifact_read");
    expect(tools.artifact_summarize.name).toBe("artifact_summarize");
  });

  test("tools have correct permissions (all safe)", () => {
    expect(tools.artifact_list.permission).toBe("safe");
    expect(tools.artifact_read.permission).toBe("safe");
    expect(tools.artifact_summarize.permission).toBe("safe");
  });

  test("tools have correct toolset", () => {
    expect(tools.artifact_list.toolset).toBe("artifacts");
    expect(tools.artifact_read.toolset).toBe("artifacts");
    expect(tools.artifact_summarize.toolset).toBe("artifacts");
  });

  test("tools have descriptions and inputSchema", () => {
    for (const key of ["artifact_list", "artifact_read", "artifact_summarize"]) {
      const t = (tools as Record<string, typeof tools.artifact_list>)[key];
      expect(t.description).toBeString();
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeObject();
    }
  });

  // ---- artifact.list ----

  test("artifact.list returns mock list", async () => {
    const result = await tools.artifact_list.execute(
      { project: "kata-agent" },
      ctx,
    );
    ok(result);
    expect(Array.isArray((result.data as Record<string, unknown>)?.artifacts)).toBe(true);
  });

  test("artifact.list works without optional params", async () => {
    const result = await tools.artifact_list.execute({}, ctx);
    ok(result);
  });

  // ---- artifact.read ----

  test("artifact.read returns mock success", async () => {
    const result = await tools.artifact_read.execute(
      { artifactId: "art-123" },
      ctx,
    );
    ok(result);
  });

  test("artifact.read returns error when artifactId is missing", async () => {
    const result = await tools.artifact_read.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- artifact.summarize ----

  test("artifact.summarize returns mock summary", async () => {
    const result = await tools.artifact_summarize.execute(
      { artifactId: "art-123" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/summary/i);
  });

  test("artifact.summarize returns error when artifactId is missing", async () => {
    const result = await tools.artifact_summarize.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});

// ===========================================================================
// Knowledge Tools
// ===========================================================================

describe("knowledge tools", () => {
  const tools = createKnowledgeTools();

  test("createKnowledgeTools returns an object with four tools", () => {
    expect(tools).toHaveProperty("knowledge_search");
    expect(tools).toHaveProperty("knowledge_suggestions");
    expect(tools).toHaveProperty("knowledge_accept");
    expect(tools).toHaveProperty("knowledge_reject");
  });

  test("tools have correct names", () => {
    expect(tools.knowledge_search.name).toBe("knowledge_search");
    expect(tools.knowledge_suggestions.name).toBe("knowledge_suggestions");
    expect(tools.knowledge_accept.name).toBe("knowledge_accept");
    expect(tools.knowledge_reject.name).toBe("knowledge_reject");
  });

  test("tools have correct permissions", () => {
    expect(tools.knowledge_search.permission).toBe("safe");
    expect(tools.knowledge_suggestions.permission).toBe("safe");
    expect(tools.knowledge_accept.permission).toBe("workspace-write");
    expect(tools.knowledge_reject.permission).toBe("workspace-write");
  });

  test("tools have correct toolset", () => {
    expect(tools.knowledge_search.toolset).toBe("knowledge");
    expect(tools.knowledge_suggestions.toolset).toBe("knowledge");
    expect(tools.knowledge_accept.toolset).toBe("knowledge");
    expect(tools.knowledge_reject.toolset).toBe("knowledge");
  });

  test("tools have descriptions and inputSchema", () => {
    for (const key of ["knowledge_search", "knowledge_suggestions", "knowledge_accept", "knowledge_reject"]) {
      const t = (tools as Record<string, typeof tools.knowledge_search>)[key];
      expect(t.description).toBeString();
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeObject();
    }
  });

  // ---- knowledge.search ----

  test("knowledge.search returns mock results", async () => {
    const result = await tools.knowledge_search.execute(
      { query: "test query" },
      ctx,
    );
    ok(result);
    expect(Array.isArray((result.data as Record<string, unknown>)?.results)).toBe(true);
  });

  test("knowledge.search returns error when query is missing", async () => {
    const result = await tools.knowledge_search.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- knowledge.suggestions ----

  test("knowledge.suggestions returns mock suggestions", async () => {
    const result = await tools.knowledge_suggestions.execute(
      { context: "code review" },
      ctx,
    );
    ok(result);
    expect(Array.isArray((result.data as Record<string, unknown>)?.suggestions)).toBe(true);
  });

  test("knowledge.suggestions works without optional context", async () => {
    const result = await tools.knowledge_suggestions.execute({}, ctx);
    ok(result);
  });

  // ---- knowledge.accept ----

  test("knowledge.accept returns mock success", async () => {
    const result = await tools.knowledge_accept.execute(
      { suggestionId: "sug-123" },
      ctx,
    );
    ok(result);
  });

  test("knowledge.accept returns error when suggestionId is missing", async () => {
    const result = await tools.knowledge_accept.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---- knowledge.reject ----

  test("knowledge.reject returns mock success", async () => {
    const result = await tools.knowledge_reject.execute(
      { suggestionId: "sug-456" },
      ctx,
    );
    ok(result);
  });

  test("knowledge.reject returns error when suggestionId is missing", async () => {
    const result = await tools.knowledge_reject.execute({}, ctx);
    fail(result);
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});
