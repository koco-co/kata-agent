import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "bun:test";
import { featureDir } from "../packages/artifact-repo/src/index";
import {
  createRuntimeServices,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function loadWorkflowDefinition(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(join(import.meta.dir, "..", "workflows", "test-case-gen.yaml"), "utf8"),
  ) as WorkflowDefinition;
}

describe("createRuntimeServices", () => {
  test("mock mode starts test-case-gen and waits for confirmation", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-runtime-"));
    roots.push(rootDir);
    const { executor } = createRuntimeServices({ rootDir, mode: "mock" });

    const result = await executor.start({
      location: { rootDir, project: "demo", feature: "rule-config" },
      definition: loadWorkflowDefinition(),
      runId: "run-1",
      sourceUrl: "mock://poor-prd",
    });

    expect(result.state.status).toBe("waiting");
    expect(result.state.currentNode).toBe("await-confirmation-result");
    const dir = featureDir({ rootDir, project: "demo", feature: "rule-config" });
    for (const path of [
      "sources/lanhu/requirement-source-bundle.json",
      "requirement/drafts/requirement-draft.json",
      "requirement/clarifications/requirement-gap-report.json",
      "requirement/clarifications/clarification-dossier.json",
      "requirement/clarifications/confirmation-draft.md",
      `traces/${result.state.runId}.jsonl`,
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }
  });

  test("real mode fails when provider config is absent", () => {
    const previous = {
      KATA_AGENT_PROVIDER_BASE_URL: process.env.KATA_AGENT_PROVIDER_BASE_URL,
      KATA_AGENT_PROVIDER_API_KEY: process.env.KATA_AGENT_PROVIDER_API_KEY,
      KATA_AGENT_PROVIDER_MODEL: process.env.KATA_AGENT_PROVIDER_MODEL,
    };
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-runtime-"));
    roots.push(rootDir);
    try {
      delete process.env.KATA_AGENT_PROVIDER_BASE_URL;
      delete process.env.KATA_AGENT_PROVIDER_API_KEY;
      delete process.env.KATA_AGENT_PROVIDER_MODEL;

      expect(() => createRuntimeServices({ rootDir, mode: "real" })).toThrow(
        "MISSING_SECRET provider config",
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
