import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_HARD_RULES,
  LocalConfigLoader,
  loadRuleSet,
} from "../packages/core/src/index";

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

  test("loads hard rules with run, project, global, default precedence", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    mkdirSync(join(rootDir, "rules"), { recursive: true });
    mkdirSync(join(rootDir, "projects", "demo"), { recursive: true });
    writeFileSync(
      join(rootDir, "rules", "global.json"),
      JSON.stringify({
        schemaVersion: "0.1",
        rules: [
          {
            id: "assertions-must-be-concrete",
            description: "global version",
            enabled: true,
          },
          {
            id: "custom-rule",
            description: "global custom",
            enabled: true,
          },
        ],
      }),
    );
    writeFileSync(
      join(rootDir, "projects", "demo", "rules.json"),
      JSON.stringify({
        schemaVersion: "0.1",
        rules: [
          {
            id: "assertions-must-be-concrete",
            description: "project version",
            enabled: true,
          },
        ],
      }),
    );

    const rules = loadRuleSet({
      rootDir,
      project: "demo",
      runRules: [
        {
          id: "assertions-must-be-concrete",
          description: "run version",
          enabled: false,
        },
      ],
    });

    expect(rules.schemaVersion).toBe("0.1");
    expect(
      rules.rules.find((rule) => rule.id === "assertions-must-be-concrete"),
    ).toMatchObject({
      description: "run version",
      enabled: false,
      source: "run",
      nonNegotiable: true,
    });
    expect(rules.rules.find((rule) => rule.id === "custom-rule")).toMatchObject({
      description: "global custom",
      source: "global",
    });
    expect(rules.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: DEFAULT_HARD_RULES[0]!.id }),
      ]),
    );
  });
});
