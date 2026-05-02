// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Artifact tools (artifact.list,
// artifact.read, artifact.summarize). These are mock tools that return
// canned responses. Real ArtifactRepository integration will replace these
// stubs.
// ---------------------------------------------------------------------------
import type { ConversationTool, ToolResult, ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Helper
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
 * Create the three artifact tools.
 *
 * - artifact.list      — List artifacts (mock)
 * - artifact.read      — Read an artifact (mock)
 * - artifact.summarize — Summarize an artifact (mock)
 *
 * All tools use permission "safe" and belong to the "artifacts" toolset.
 */
export function createArtifactTools(): Record<string, ConversationTool> {
  const listTool: ConversationTool = {
    name: "artifact.list",
    description:
      "List artifacts, optionally filtered by project or feature. " +
      "Returns a mock list of artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Optional project filter",
        },
        feature: {
          type: "string",
          description: "Optional feature filter",
        },
      },
      required: [],
    },
    permission: "safe",
    toolset: "artifacts",

    async execute(
      _input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      return {
        ok: true,
        summary: "Found 2 artifacts (mock)",
        data: {
          artifacts: [
            {
              artifactId: "art-001",
              name: "Design Doc",
              type: "document",
              project: "kata-agent",
              createdAt: new Date(Date.now() - 86400_000).toISOString(),
            },
            {
              artifactId: "art-002",
              name: "Test Results",
              type: "report",
              project: "kata-agent",
              createdAt: new Date().toISOString(),
            },
          ],
        },
      };
    },
  };

  const readTool: ConversationTool = {
    name: "artifact.read",
    description:
      "Read the full contents of an artifact by ID. Returns mock content.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: {
          type: "string",
          description: "The artifact ID to read",
        },
      },
      required: ["artifactId"],
    },
    permission: "safe",
    toolset: "artifacts",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const artifactId = String(input.artifactId ?? "").trim();

      if (!artifactId) {
        return missingParam("artifactId");
      }

      return {
        ok: true,
        summary: `Read artifact ${artifactId} (mock)`,
        data: {
          artifactId,
          content: `Mock content for artifact ${artifactId}. This is a placeholder that will be replaced with real artifact repository integration.`,
          contentType: "text/markdown",
          size: 128,
        },
      };
    },
  };

  const summarizeTool: ConversationTool = {
    name: "artifact.summarize",
    description:
      "Generate a brief summary of an artifact by ID. Returns mock summary.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: {
          type: "string",
          description: "The artifact ID to summarize",
        },
      },
      required: ["artifactId"],
    },
    permission: "safe",
    toolset: "artifacts",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const artifactId = String(input.artifactId ?? "").trim();

      if (!artifactId) {
        return missingParam("artifactId");
      }

      return {
        ok: true,
        summary: `Summary for artifact ${artifactId} (mock)`,
        data: {
          artifactId,
          summary: `This is a mock summary of artifact ${artifactId}. It describes the key points and findings contained within the artifact.`,
        },
      };
    },
  };

  return {
    artifact_list: listTool,
    artifact_read: readTool,
    artifact_summarize: summarizeTool,
  };
}
