import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  consultKnowledge,
  proposeKnowledge,
  readSuggestion,
} from "../packages/knowledge-repo/src/index";
import { PluginActionRegistry } from "../packages/plugin-runtime/src/index";
import { mockFetchRequirement } from "../plugins/lanhu/src/mock";
import { mockExportXMind } from "../plugins/xmind/src/mock";
import type {
  RequirementDraft,
  RequirementSpec,
  TestSpec,
} from "../packages/domain/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("action registry and mock actions", () => {
  test("registers and executes handlers", async () => {
    const registry = new PluginActionRegistry();
    registry.register("demo.echo", (input) => input);
    await expect(
      registry.execute("demo.echo", { ok: true }, {
        rootDir: "/tmp",
        project: "demo",
        feature: "rule-config",
      }),
    ).resolves.toEqual({ ok: true });
    expect(() => registry.register("demo.echo", () => ({}))).toThrow(
      "Action already registered",
    );
  });

  test("consults and proposes knowledge suggestions", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const draft: RequirementDraft = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      facts: [],
    };
    expect(consultKnowledge(draft).query).toBe("规则配置");

    const requirement: RequirementSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      status: "confirmed",
      rules: [
        {
          id: "REQ-001",
          text: "保存成功后展示成功提示。",
          severity: "P0",
          sourceType: "confirmation",
          sourceRefs: ["SRC-001"],
          confirmationQuestionId: "GAP-001",
        },
      ],
      pageContracts: [],
      openItems: [],
      assumptions: [],
    };
    const suggestions = proposeKnowledge(requirement, rootDir);
    expect(suggestions).toHaveLength(1);
    const suggestionFiles = readdirSync(
      join(rootDir, "projects", "demo", "knowledge", "suggestions"),
    );
    expect(suggestionFiles).toHaveLength(1);
    expect(
      readSuggestion(
        join(
          rootDir,
          "projects",
          "demo",
          "knowledge",
          "suggestions",
          suggestionFiles[0]!,
        ),
      ).content,
    ).toContain("成功提示");
  });

  test("provides deterministic Lanhu and XMind mocks", () => {
    const bundle = mockFetchRequirement({
      url: "mock://poor-prd",
      outputDir: "sources/lanhu",
    });
    expect(bundle.sourceType).toBe("lanhu");
    expect(bundle.textBlocks[0]?.content).toContain("成功提示");

    const spec: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      requirementRef: "requirement/spec/requirement-spec.json",
      status: "reviewed",
      modules: [
        {
          id: "M1",
          name: "规则",
          requirementRefs: ["REQ-001"],
          cases: [],
        },
      ],
    };
    expect(mockExportXMind(spec).caseCount).toBe(0);
  });
});
