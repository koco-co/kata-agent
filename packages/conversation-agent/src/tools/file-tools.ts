// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — File tools (list, read, write) with
// strict path canonicalization preventing traversal attacks and symlink
// escapes.
// ---------------------------------------------------------------------------
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import type { ConversationTool, ToolResult, ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/** Extensions that are considered binary (not readable as text). */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".avif",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".mov",
  ".avi",
  ".zip",
  ".gz",
  ".tar",
  ".bz2",
  ".xz",
  ".rar",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".pyc",
  ".pyo",
  ".pyd",
  ".o",
  ".a",
  ".lib",
  ".obj",
]);

// ---------------------------------------------------------------------------
// Path canonicalization
// ---------------------------------------------------------------------------

interface PathCheckResult {
  allowed: boolean;
  resolved?: string;
  error?: string;
}

/** Check if `pathToCheck` is at or under `canonicalRoot` (which has trailing /). */
function isWithinWorkspace(pathToCheck: string, canonicalRoot: string): boolean {
  // Match exact root (canonicalRoot without trailing slash) or subpath
  const rootWithoutSlash = canonicalRoot.slice(0, -1);
  return pathToCheck === rootWithoutSlash || pathToCheck.startsWith(canonicalRoot);
}

/**
 * Validates that `requestedPath` is safely inside `workspaceRoot`.
 *
 * Rules (in order):
 * 1. Reject paths starting with `~` (home directory expansion).
 * 2. Resolve the path relative to `workspaceRoot` via `path.resolve`.
 * 3. For existing files/directories: use `fs.realpathSync` to resolve
 *    symlinks — reject if the symlink target escapes the workspace.
 * 4. For non-existent paths (new files): walk up the directory tree,
 *    checking each existing parent component via `fs.realpathSync` to ensure
 *    no symlink in the chain escapes the workspace.
 */
function isPathInsideWorkspace(
  requestedPath: string,
  workspaceRoot: string,
): PathCheckResult {
  // 1. Reject home directory expansion
  if (requestedPath.startsWith("~")) {
    return {
      allowed: false,
      error: "Home directory expansion (~) is not allowed",
    };
  }

  // 2. Resolve relative to workspace (gives us an absolute path)
  const resolved = resolve(workspaceRoot, requestedPath);

  // 3. Compute canonical root — resolve any symlinks in workspaceRoot itself
  //    (e.g. macOS: /var → /private/var)
  let canonicalRoot: string;
  try {
    canonicalRoot =
      (existsSync(workspaceRoot)
        ? realpathSync(workspaceRoot)
        : resolve(workspaceRoot)) + "/";
  } catch {
    canonicalRoot = resolve(workspaceRoot) + "/";
  }

  // 4. For existing files: resolve symlinks and check the real path
  if (existsSync(resolved)) {
    try {
      const real = realpathSync(resolved);
      if (!isWithinWorkspace(real, canonicalRoot)) {
        return {
          allowed: false,
          error: "Symlink target escapes workspace",
        };
      }
      return { allowed: true, resolved: real };
    } catch {
      return {
        allowed: false,
        error: "Cannot resolve real path of existing file",
      };
    }
  }

  // 5. For non-existent paths (new files being written), ensure the resolved
  //    path would be inside the canonical workspace. Since the file itself
  //    doesn't exist, we check the parent directory and walk up the chain.
  const parentResolved = dirname(resolved);
  if (!isWithinWorkspace(parentResolved, canonicalRoot)) {
    // The resolved path itself (before symlink resolution) might use a
    // non-canonical prefix (e.g. /var/... vs /private/var/...). When the
    // workspaceRoot contains a symlink that's NOT at the filesystem root,
    // the plain resolved path won't start with canonicalRoot. In that case,
    // check against the non-canonical root.
    const nonCanonicalRoot = resolve(workspaceRoot) + "/";
    if (!isWithinWorkspace(parentResolved, nonCanonicalRoot)) {
      return {
        allowed: false,
        error: "Path escapes workspace",
      };
    }
  }

  // Walk up parent chain checking each existing component for symlink escapes.
  // Only check parents AT or BELOW the workspace root — parents above it are
  // outside the workspace boundary and not relevant for escape detection.
  let current = resolved;
  const rootStr = resolve(workspaceRoot);
  while (current.startsWith(rootStr + "/")) {
    const parent = dirname(current);
    if (parent === current) break; // hit filesystem root — safety
    if (existsSync(parent)) {
      try {
        const realParent = realpathSync(parent);
        if (!isWithinWorkspace(realParent, canonicalRoot)) {
          return {
            allowed: false,
            error: "Parent directory symlink escapes workspace",
          };
        }
      } catch {
        return {
          allowed: false,
          error: "Cannot resolve parent directory real path",
        };
      }
    }
    current = parent;
  }

  return { allowed: true, resolved };
}

// ---------------------------------------------------------------------------
// Binary file detection
// ---------------------------------------------------------------------------

/**
 * Quick heuristic check to detect binary files.
 * Checks extension first, then reads the first few bytes for null bytes.
 */
function isBinaryFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  // If extension is unknown, check first 512 bytes for null bytes
  try {
    const fd = readFileSync(filePath);
    const head = fd.slice(0, Math.min(512, fd.length));
    // If the first 512 bytes contain a null byte, treat as binary
    return head.includes(0);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Create the three file tools (file_list, file_read, file_write) bound to
 * the given `workspaceRoot`.
 */
export function createFileTools(
  workspaceRoot: string,
): Record<string, ConversationTool> {
  const listTool: ConversationTool = {
    name: "file_list",
    description: "List files and directories inside the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path relative to workspace root",
        },
      },
      required: ["path"],
    },
    permission: "safe",
    toolset: "files",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const path = String(input.path ?? "");
      const check = isPathInsideWorkspace(path, workspaceRoot);
      if (!check.allowed) {
        return {
          ok: false,
          summary: check.error!,
          error: {
            code: "PATH_TRAVERSAL",
            retryable: false,
            message: check.error!,
          },
        };
      }

      try {
        const entries = readdirSync(check.resolved!);
        return {
          ok: true,
          summary: `Found ${entries.length} entries`,
          data: entries,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Cannot list directory: ${msg}`,
          error: {
            code: "LIST_ERROR",
            retryable: false,
            message: msg,
          },
        };
      }
    },
  };

  const readTool: ConversationTool = {
    name: "file_read",
    description: "Read the contents of a file inside the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to workspace root",
        },
      },
      required: ["path"],
    },
    permission: "safe",
    toolset: "files",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const path = String(input.path ?? "");
      const check = isPathInsideWorkspace(path, workspaceRoot);
      if (!check.allowed) {
        return {
          ok: false,
          summary: check.error!,
          error: {
            code: "PATH_TRAVERSAL",
            retryable: false,
            message: check.error!,
          },
        };
      }

      try {
        const stats = statSync(check.resolved!);
        if (stats.size > MAX_FILE_SIZE) {
          return {
            ok: false,
            summary: "File exceeds 2 MB size limit",
            error: {
              code: "FILE_TOO_LARGE",
              retryable: false,
              message:
                "File exceeds 2 MB size limit. Use artifact.read for large files.",
            },
          };
        }

        // Check for binary files
        if (isBinaryFile(check.resolved!)) {
          return {
            ok: false,
            summary: "File appears to be binary and cannot be read as text",
            error: {
              code: "BINARY_FILE",
              retryable: false,
              message:
                "Cannot read binary files. Use artifact.read for binary files.",
            },
          };
        }

        const content = readFileSync(check.resolved!, "utf-8");
        return {
          ok: true,
          summary: `Read ${content.length} chars`,
          data: content,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Cannot read file: ${msg}`,
          error: {
            code: "READ_ERROR",
            retryable: false,
            message: msg,
          },
        };
      }
    },
  };

  const writeTool: ConversationTool = {
    name: "file_write",
    description: "Write content to a file inside the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to workspace root",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
    permission: "workspace-write",
    toolset: "files",

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const path = String(input.path ?? "");
      const content = input.content !== undefined ? String(input.content) : "";

      // Reject content > 2MB
      if (content.length > MAX_FILE_SIZE) {
        return {
          ok: false,
          summary: "Content exceeds 2 MB size limit",
          error: {
            code: "FILE_TOO_LARGE",
            retryable: false,
            message: "File content exceeds 2 MB size limit",
          },
        };
      }

      const check = isPathInsideWorkspace(path, workspaceRoot);
      if (!check.allowed) {
        return {
          ok: false,
          summary: check.error!,
          error: {
            code: "PATH_TRAVERSAL",
            retryable: false,
            message: check.error!,
          },
        };
      }

      try {
        mkdirSync(dirname(check.resolved!), { recursive: true });
        writeFileSync(check.resolved!, content, "utf-8");
        return {
          ok: true,
          summary: `Written ${content.length} chars to ${path}`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Cannot write file: ${msg}`,
          error: {
            code: "WRITE_ERROR",
            retryable: false,
            message: msg,
          },
        };
      }
    },
  };

  return {
    file_list: listTool,
    file_read: readTool,
    file_write: writeTool,
  };
}
