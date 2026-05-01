import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { fetchLanhuRequirement } from "../plugins/lanhu/src/real";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Lanhu real source capture", () => {
  test("captures html source without exposing cookie", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    const output = await fetchLanhuRequirement(
      { url: "https://lanhu.example/prd", outputDir: "sources/lanhu" },
      {
        rootDir,
        project: "demo",
        feature: "rule-config",
        cookie: "secret-cookie",
        fetchImpl: async (_url, init) => {
          expect(JSON.stringify(init)).toContain("secret-cookie");
          return new Response(
            "<html><body><h1>规则配置</h1><p>保存按钮</p></body></html>",
          );
        },
      },
    );
    expect(output.textBlocks[0]?.content).toContain("规则配置");
    expect(JSON.stringify(output)).not.toContain("secret-cookie");
    expect(
      existsSync(
        join(
          rootDir,
          "projects",
          "demo",
          "features",
          "rule-config",
          "sources",
          "lanhu",
          "raw.html",
        ),
      ),
    ).toBe(true);
  });
});
