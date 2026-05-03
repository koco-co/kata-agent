import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTestingWorkspace } from "../../packages/conversation-agent/src/testing/workspace";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kata-agent-testing-workspace-"));
  mkdirSync(join(root, "features"), { recursive: true });
  mkdirSync(join(root, "tests/e2e"), { recursive: true });
  mkdirSync(join(root, "test-cases"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "features/login.feature"), "Feature: login");
  writeFileSync(join(root, "tests/e2e/login.spec.ts"), "test('login', () => {})");
  writeFileSync(join(root, "test-cases/login.md"), "# login cases");
  writeFileSync(join(root, "reports/login.html"), "<html></html>");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "kata-demo" }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("discoverTestingWorkspace", () => {
  test("counts testing assets without creating files", () => {
    const summary = discoverTestingWorkspace(root);

    expect(summary).toEqual({
      root,
      name: "kata-demo",
      status: "ready",
      featureCount: 1,
      specCount: 1,
      caseAssetCount: 1,
      reportCount: 1,
      featureFiles: ["features/login.feature"],
    });
  });

  test("returns empty status for a directory without testing assets", () => {
    rmSync(join(root, "features"), { recursive: true, force: true });
    rmSync(join(root, "tests"), { recursive: true, force: true });
    rmSync(join(root, "test-cases"), { recursive: true, force: true });
    rmSync(join(root, "reports"), { recursive: true, force: true });

    const summary = discoverTestingWorkspace(root);

    expect(summary.status).toBe("empty");
    expect(summary.featureCount).toBe(0);
    expect(summary.specCount).toBe(0);
    expect(summary.caseAssetCount).toBe(0);
    expect(summary.reportCount).toBe(0);
    expect(summary.featureFiles).toEqual([]);
  });
});
