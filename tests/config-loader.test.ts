import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { LocalConfigLoader } from "../packages/core/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("LocalConfigLoader", () => {
  test("loads .env and lets explicit env override it", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    writeFileSync(join(rootDir, ".env"), "LANHU_COOKIE=file-cookie\n");
    const fileLoader = new LocalConfigLoader({ rootDir });
    expect(fileLoader.resolveSecret("LANHU_COOKIE")).toBe("file-cookie");

    const overrideLoader = new LocalConfigLoader({
      rootDir,
      env: { LANHU_COOKIE: "env-cookie" },
    });
    expect(overrideLoader.resolveSecret("LANHU_COOKIE")).toBe("env-cookie");
  });
});
