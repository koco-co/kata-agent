import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    writeFileSync(join(rootDir, ".env"), "KATA_TEST_CONFIG_SECRET = file-secret\n");
    const fileLoader = new LocalConfigLoader({ rootDir, env: {} });
    expect(fileLoader.resolveSecret("KATA_TEST_CONFIG_SECRET")).toBe("file-secret");

    const overrideLoader = new LocalConfigLoader({
      rootDir,
      env: { KATA_TEST_CONFIG_SECRET: "env-secret" },
    });
    expect(overrideLoader.resolveSecret("KATA_TEST_CONFIG_SECRET")).toBe("env-secret");
  });

  test("loads project config from project.yaml", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const projectDir = join(rootDir, "projects", "design-sync");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "project.yaml"),
      "name: Design Sync\nprovider:\n  type: lanhu\n  projectId: abc123\n",
    );

    const loader = new LocalConfigLoader({ rootDir, env: {} });

    expect(loader.loadProjectConfig("design-sync")).toEqual({
      name: "Design Sync",
      provider: {
        type: "lanhu",
        projectId: "abc123",
      },
    });
  });

  test("returns empty project config when project.yaml is missing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const loader = new LocalConfigLoader({ rootDir, env: {} });

    expect(loader.loadProjectConfig("missing")).toEqual({});
  });
});
