// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — file-tools tests
// ---------------------------------------------------------------------------
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { createFileTools } from "../../packages/conversation-agent/src/tools/file-tools";
import type { ToolContext, ToolResult } from "../../packages/conversation-agent/src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let workspaceRoot: string;
let ctx: ToolContext;

function ok(r: ToolResult): asserts r is { ok: true; summary: string; data?: unknown } {
  expect(r.ok).toBe(true);
}

function fail(r: ToolResult): asserts r is { ok: false; summary: string; error: { code: string; retryable: boolean; message: string } } {
  expect(r.ok).toBe(false);
  expect(r.error).toBeObject();
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  workspaceRoot = join(tmpdir(), `file-tools-test-${randomUUID()}`);
  mkdirSync(workspaceRoot, { recursive: true });

  // Create some test files
  writeFileSync(join(workspaceRoot, "hello.txt"), "Hello, World!");
  writeFileSync(join(workspaceRoot, "nested-file.txt"), "Nested content");
  mkdirSync(join(workspaceRoot, "subdir"), { recursive: true });
  writeFileSync(join(workspaceRoot, "subdir", "deep.txt"), "Deep content");

  // Create a symlink inside workspace that points to a file inside workspace
  try {
    symlinkSync(
      join(workspaceRoot, "hello.txt"),
      join(workspaceRoot, "link-to-hello.txt"),
    );
  } catch {
    // symlinks may fail on some platforms; ignore
  }

  ctx = {
    workspaceRoot,
    sessionId: "test-session",
    yolo: false,
    env: {},
  };
});

afterAll(() => {
  rmSync(workspaceRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("file_read", () => {
  test("reads a file inside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "hello.txt" }, ctx);
    ok(result);
    expect(result.summary).toMatch(/Read \d+ chars/);
    expect(result.data).toBe("Hello, World!");
  });

  test("reads file with absolute path inside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: join(workspaceRoot, "hello.txt") }, ctx);
    ok(result);
    expect(result.data).toBe("Hello, World!");
  });

  test("rejects path traversal (../)", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "../etc/passwd" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects absolute path outside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "/etc/passwd" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects home directory expansion (~)", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "~/passwd" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects file exceeding 2 MB", async () => {
    // Create a 2.5 MB file
    const bigPath = join(workspaceRoot, "big.bin");
    const buf = Buffer.alloc(2.5 * 1024 * 1024, "x");
    writeFileSync(bigPath, buf);

    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "big.bin" }, ctx);
    fail(result);
    expect(result.error.code).toBe("FILE_TOO_LARGE");

    rmSync(bigPath);
  });

  test("returns error for non-existent file", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "nonexistent.txt" }, ctx);
    fail(result);
    expect(result.error.code).toBe("READ_ERROR");
  });

  test("reads file via symlink inside workspace", async () => {
    if (!existsSync(join(workspaceRoot, "link-to-hello.txt"))) {
      return; // skip if symlink creation failed
    }
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "link-to-hello.txt" }, ctx);
    ok(result);
    expect(result.data).toBe("Hello, World!");
  });
});

describe("file_write", () => {
  test("writes a new file inside workspace (creates parent dirs)", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "newdir/newfile.txt", content: "New content" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/Written 11 chars to newdir\/newfile.txt/);
    expect(existsSync(join(workspaceRoot, "newdir", "newfile.txt"))).toBe(true);

    // Cleanup
    rmSync(join(workspaceRoot, "newdir"), { recursive: true, force: true });
  });

  test("overwrites existing file", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "hello.txt", content: "Overwritten!" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/Written 12 chars to hello.txt/);

    // Verify via read
    const readResult = await tools.file_read.execute({ path: "hello.txt" }, ctx);
    ok(readResult);
    expect(readResult.data).toBe("Overwritten!");

    // Restore
    writeFileSync(join(workspaceRoot, "hello.txt"), "Hello, World!");
  });

  test("rejects write outside workspace via path traversal", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "../evil.txt", content: "evil" },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects write with absolute path outside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "/tmp/evil.txt", content: "evil" },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects home directory expansion in write", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "~/evil.txt", content: "evil" },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects content exceeding 2 MB", async () => {
    const tools = createFileTools(workspaceRoot);
    const largeContent = "x".repeat(2.1 * 1024 * 1024);
    const result = await tools.file_write.execute(
      { path: "large.txt", content: largeContent },
      ctx,
    );
    fail(result);
    expect(result.error.code).toBe("FILE_TOO_LARGE");
  });

  test("writes empty content", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_write.execute(
      { path: "empty.txt", content: "" },
      ctx,
    );
    ok(result);
    expect(result.summary).toMatch(/Written 0 chars to empty.txt/);
    expect(existsSync(join(workspaceRoot, "empty.txt"))).toBe(true);

    rmSync(join(workspaceRoot, "empty.txt"));
  });
});

describe("file_list", () => {
  test("lists entries in workspace root", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_list.execute({ path: "." }, ctx);
    ok(result);
    expect(result.data).toBeArray();
    expect(result.data).toContain("hello.txt");
    expect(result.data).toContain("subdir");
  });

  test("lists entries in subdirectory", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_list.execute({ path: "subdir" }, ctx);
    ok(result);
    expect(result.data).toContain("deep.txt");
  });

  test("rejects listing outside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_list.execute({ path: ".." }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });

  test("rejects listing with absolute path outside workspace", async () => {
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_list.execute({ path: "/tmp" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });
});

describe("path canonicalization - sibling false positive prevention", () => {
  test("path resolving to sibling directory with similar name is rejected", async () => {
    // workspace is /tmp/file-tools-test-<uuid>
    // A path like "/tmp/file-tools-test-OTHER/evil.txt" should NOT match
    const siblingDir = workspaceRoot + "-sibling";
    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: siblingDir + "/evil.txt" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");
  });
});

describe("symlink escape prevention", () => {
  test("symlink pointing outside workspace is rejected on read", async () => {
    // Create a symlink inside workspace pointing outside
    const escapeLink = join(workspaceRoot, "escape-link");
    try {
      symlinkSync("/etc/passwd", escapeLink);
    } catch {
      return; // skip if cannot create symlink (e.g. Windows without admin)
    }

    const tools = createFileTools(workspaceRoot);
    const result = await tools.file_read.execute({ path: "escape-link" }, ctx);
    fail(result);
    expect(result.error.code).toBe("PATH_TRAVERSAL");

    rmSync(escapeLink);
  });
});

describe("module exports", () => {
  test("createFileTools returns an object with three tools", () => {
    const tools = createFileTools(workspaceRoot);
    expect(tools).toHaveProperty("file_list");
    expect(tools).toHaveProperty("file_read");
    expect(tools).toHaveProperty("file_write");
    expect(tools.file_list.name).toBe("file_list");
    expect(tools.file_read.name).toBe("file_read");
    expect(tools.file_write.name).toBe("file_write");
  });

  test("tools have correct permissions", () => {
    const tools = createFileTools(workspaceRoot);
    expect(tools.file_list.permission).toBe("safe");
    expect(tools.file_read.permission).toBe("safe");
    expect(tools.file_write.permission).toBe("workspace-write");
  });

  test("tools have correct toolset", () => {
    const tools = createFileTools(workspaceRoot);
    expect(tools.file_list.toolset).toBe("files");
    expect(tools.file_read.toolset).toBe("files");
    expect(tools.file_write.toolset).toBe("files");
  });
});
