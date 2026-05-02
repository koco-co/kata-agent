// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — QA Workflow tools (workflow.start,
// workflow.status, workflow.resume, workflow.find_runs). These are mock
// tools that return canned responses. Real WorkflowEngine integration will
// replace these stubs when wired through the engine.
// ---------------------------------------------------------------------------
import type { ConversationTool, ToolResult, ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Helper: build a standard INVALID_INPUT error result
// ---------------------------------------------------------------------------

function missingParam(name: string): ToolResult {
  return {
    ok: false,
    summary: `Missing required parameter: "${name}"`,
    error: {
      code: "INVALID_INPUT",
      retryable: false,
      message: `The '${name}' parameter is required.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Create the four QA workflow tools.
 *
 * - workflow.start      — Start a new QA workflow run (mock)
 * - workflow.status     — Check the status of a workflow run (mock)
 * - workflow.resume     — Resume a workflow run (mock)
 * - workflow.find_runs  — Find recent workflow runs (mock)
 *
 * All tools use permission "safe" and belong to the "qa-workflows" toolset.
 */
export function createWorkflowTools(): Record<string, ConversationTool> {
  const startTool: ConversationTool = {
    name: "workflow_start",
    description:
      "Start a QA workflow. Accepts workflow name, optional project, " +
      "feature, and source URL. Returns a mock run ID.",
    inputSchema: {
      type: "object",
      properties: {
        workflowName: {
          type: "string",
          description: "Name of the workflow to start (e.g. 'qa-review')",
        },
        project: {
          type: "string",
          description: "Optional project name",
        },
        feature: {
          type: "string",
          description: "Optional feature or branch name",
        },
        sourceUrl: {
          type: "string",
          description: "Optional URL to the source (e.g. PR URL)",
        },
      },
      required: ["workflowName"],
    },
    permission: "safe",
    toolset: "qa-workflows",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const workflowName = String(input.workflowName ?? "").trim();

      if (!workflowName) {
        return missingParam("workflowName");
      }

      const runId = `mock-run-${Date.now()}`;

      return {
        ok: true,
        summary: `Started workflow ${workflowName} (run ID: ${runId})`,
        data: {
          runId,
          workflowName,
        },
      };
    },
  };

  const statusTool: ConversationTool = {
    name: "workflow_status",
    description:
      "Check the current status of a workflow run. Returns a mock status.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID to check",
        },
      },
      required: ["runId"],
    },
    permission: "safe",
    toolset: "qa-workflows",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const runId = String(input.runId ?? "").trim();

      if (!runId) {
        return missingParam("runId");
      }

      return {
        ok: true,
        summary: `Status for run ${runId}: in_progress (mock)`,
        data: {
          runId,
          status: "in_progress",
          startedAt: new Date().toISOString(),
        },
      };
    },
  };

  const resumeTool: ConversationTool = {
    name: "workflow_resume",
    description:
      "Resume a paused workflow run. Returns a mock success response.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID to resume",
        },
      },
      required: ["runId"],
    },
    permission: "safe",
    toolset: "qa-workflows",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const runId = String(input.runId ?? "").trim();

      if (!runId) {
        return missingParam("runId");
      }

      return {
        ok: true,
        summary: `Run ${runId} resumed successfully (mock)`,
        data: {
          runId,
          resumed: true,
          resumedAt: new Date().toISOString(),
        },
      };
    },
  };

  const findRunsTool: ConversationTool = {
    name: "workflow_find_runs",
    description:
      "Find recent workflow runs, optionally filtered by project or " +
      "workflow name. Returns a mock list.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Optional project filter",
        },
        workflowName: {
          type: "string",
          description: "Optional workflow name filter",
        },
      },
      required: [],
    },
    permission: "safe",
    toolset: "qa-workflows",

    async execute(
      _input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      return {
        ok: true,
        summary: "Found 2 recent workflow runs (mock)",
        data: {
          runs: [
            {
              runId: "mock-run-1",
              workflowName: "qa-review",
              status: "completed",
              startedAt: new Date(Date.now() - 3600_000).toISOString(),
            },
            {
              runId: "mock-run-2",
              workflowName: "code-review",
              status: "in_progress",
              startedAt: new Date().toISOString(),
            },
          ],
        },
      };
    },
  };

  return {
    workflow_start: startTool,
    workflow_status: statusTool,
    workflow_resume: resumeTool,
    workflow_find_runs: findRunsTool,
  };
}
