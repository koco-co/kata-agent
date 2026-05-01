import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  readJsonArtifact,
  writeJsonArtifact,
} from "../packages/artifact-repo/src/index";
import type { RequirementDraft } from "../packages/domain/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validated artifact helpers", () => {
  test("validates before write and after read", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const draft: RequirementDraft = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "规则配置",
      facts: [],
    };
    const ref = writeJsonArtifact(
      location,
      "RequirementDraft",
      "requirement/drafts/requirement-draft.json",
      draft,
      "test",
      { allowedScopes: ["feature.requirement.drafts"] },
    );
    expect(
      readJsonArtifact<RequirementDraft>(
        location,
        ref,
        "RequirementDraft",
      ).title,
    ).toBe("规则配置");
  });
});
