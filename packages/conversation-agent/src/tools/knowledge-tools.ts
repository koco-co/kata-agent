// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — Knowledge tools (knowledge.search,
// knowledge.suggestions, knowledge.accept, knowledge.reject). These are
// mock tools that return canned responses. Real KnowledgeRepository
// integration will replace these stubs.
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
 * Create the four knowledge tools.
 *
 * - knowledge.search      — Search the knowledge base (safe permission)
 * - knowledge.suggestions — Get AI-generated suggestions (safe permission)
 * - knowledge.accept      — Accept a suggestion (workspace-write permission)
 * - knowledge.reject      — Reject a suggestion (workspace-write permission)
 *
 * Search and suggestions use permission "safe"; accept and reject use
 * "workspace-write". All belong to the "knowledge" toolset.
 */
export function createKnowledgeTools(): Record<string, ConversationTool> {
  const searchTool: ConversationTool = {
    name: "knowledge.search",
    description:
      "Search the knowledge base with a text query. Returns mock results " +
      "matching the query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
      },
      required: ["query"],
    },
    permission: "safe",
    toolset: "knowledge",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const query = String(input.query ?? "").trim();

      if (!query) {
        return missingParam("query");
      }

      return {
        ok: true,
        summary: `Found 1 result for "${query}" (mock)`,
        data: {
          results: [
            {
              id: "kb-001",
              title: `Result for "${query}"`,
              snippet: `This is a mock knowledge base result matching "${query}". Real integration will return actual knowledge entries.`,
              relevance: 0.95,
            },
          ],
        },
      };
    },
  };

  const suggestionsTool: ConversationTool = {
    name: "knowledge.suggestions",
    description:
      "Get AI-generated suggestions based on optional context. Returns " +
      "mock suggestion items.",
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "Optional context to generate suggestions from",
        },
      },
      required: [],
    },
    permission: "safe",
    toolset: "knowledge",

    async execute(
      _input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      return {
        ok: true,
        summary: "Generated 2 suggestions (mock)",
        data: {
          suggestions: [
            {
              suggestionId: "sug-001",
              title: "Add type annotations to public API",
              description:
                "Consider adding explicit type annotations to all public " +
                "function signatures for better documentation and type safety.",
              category: "code-quality",
            },
            {
              suggestionId: "sug-002",
              title: "Extract repeated logic into utility function",
              description:
                "The same validation pattern appears in three places. " +
                "Consider extracting it into a shared utility.",
              category: "refactoring",
            },
          ],
        },
      };
    },
  };

  const acceptTool: ConversationTool = {
    name: "knowledge.accept",
    description:
      "Accept a knowledge suggestion by ID. Marks the suggestion as " +
      "accepted (mock).",
    inputSchema: {
      type: "object",
      properties: {
        suggestionId: {
          type: "string",
          description: "The suggestion ID to accept",
        },
      },
      required: ["suggestionId"],
    },
    permission: "workspace-write",
    toolset: "knowledge",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const suggestionId = String(input.suggestionId ?? "").trim();

      if (!suggestionId) {
        return missingParam("suggestionId");
      }

      return {
        ok: true,
        summary: `Suggestion ${suggestionId} accepted (mock)`,
        data: {
          suggestionId,
          status: "accepted",
          acceptedAt: new Date().toISOString(),
        },
      };
    },
  };

  const rejectTool: ConversationTool = {
    name: "knowledge.reject",
    description:
      "Reject a knowledge suggestion by ID. Marks the suggestion as " +
      "rejected (mock).",
    inputSchema: {
      type: "object",
      properties: {
        suggestionId: {
          type: "string",
          description: "The suggestion ID to reject",
        },
      },
      required: ["suggestionId"],
    },
    permission: "workspace-write",
    toolset: "knowledge",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const suggestionId = String(input.suggestionId ?? "").trim();

      if (!suggestionId) {
        return missingParam("suggestionId");
      }

      return {
        ok: true,
        summary: `Suggestion ${suggestionId} rejected (mock)`,
        data: {
          suggestionId,
          status: "rejected",
          rejectedAt: new Date().toISOString(),
        },
      };
    },
  };

  return {
    knowledge_search: searchTool,
    knowledge_suggestions: suggestionsTool,
    knowledge_accept: acceptTool,
    knowledge_reject: rejectTool,
  };
}
