import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  artifactPath,
  readArtifactIndex,
  readArtifactVerified,
  writeArtifact,
} from "../packages/artifact-repo/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("artifact store", () => {
  test("indexes artifacts, backs up overwrite, and verifies hash", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };

    const first = writeArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      '{"a":1}',
      "test",
    );
    writeArtifact(
      location,
      "TestSpec",
      "test-spec/test-spec.json",
      '{"a":2}',
      "test",
    );

    expect(readArtifactIndex(location).artifacts).toHaveLength(1);
    expect(existsSync(artifactPath(location, ".history"))).toBe(true);
    expect(existsSync(artifactPath(location, "feature.yaml"))).toBe(true);
    expect(
      readArtifactVerified(location, readArtifactIndex(location).artifacts[0]!),
    ).toBe('{"a":2}');

    writeFileSync(artifactPath(location, "test-spec/test-spec.json"), "corrupt");
    expect(() => readArtifactVerified(location, first)).toThrow(
      "Artifact hash mismatch",
    );
    expect(() =>
      writeArtifact(location, "Bad", "../escape.json", "{}", "test"),
    ).toThrow("Artifact path must");
    expect(() =>
      writeArtifact(
        location,
        "Bad",
        join(rootDir, "escape.json"),
        "{}",
        "test",
      ),
    ).toThrow("Artifact path must");
    expect(() =>
      writeArtifact(
        location,
        "TestSpec",
        "test-spec/test-spec.json",
        "{}",
        "test",
        { allowedScopes: ["feature.requirement.spec"] },
      ),
    ).toThrow("FORBIDDEN_WRITE_SCOPE");
  });

  test("automation write scope is limited to automation artifacts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };

    expect(() =>
      writeArtifact(
        location,
        "RunPlan",
        "automation/run-plan.json",
        "{}",
        "test",
        { allowedScopes: ["feature.automation"] },
      ),
    ).not.toThrow();

    expect(() =>
      writeArtifact(
        location,
        "RunPlan",
        "reports/run-plan.json",
        "{}",
        "test",
        { allowedScopes: ["feature.automation"] },
      ),
    ).toThrow("FORBIDDEN_WRITE_SCOPE");
  });

  test("rejects project and feature path escape segments", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    expect(() =>
      artifactPath(
        { rootDir, project: "../outside", feature: "rule-config" },
        "feature.yaml",
      ),
    ).toThrow("Feature location project");
    expect(() =>
      artifactPath(
        { rootDir, project: "demo", feature: "nested/feature" },
        "feature.yaml",
      ),
    ).toThrow("Feature location feature");
  });
});
