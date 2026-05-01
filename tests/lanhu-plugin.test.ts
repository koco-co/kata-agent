import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    const html = "<html><body><h1>规则配置</h1><p>保存按钮</p></body></html>";
    const output = await fetchLanhuRequirement(
      { url: "https://lanhu.example/prd", outputDir: "sources/lanhu" },
      {
        rootDir,
        project: "demo",
        feature: "rule-config",
        cookie: "secret-cookie",
        fetchImpl: async (url, init) => {
          expect(url).toBe("https://lanhu.example/prd");
          expect(init?.headers).toEqual({ cookie: "secret-cookie" });
          return new Response(html);
        },
      },
    );
    const rawPath = join(
      rootDir,
      "projects",
      "demo",
      "features",
      "rule-config",
      "sources",
      "lanhu",
      "raw.html",
    );
    expect(output.textBlocks[0]?.content).toContain("规则配置");
    expect(output.rawFiles[0]?.path).toBe("sources/lanhu/raw.html");
    expect(output.rawFiles[0]?.hash).toBe(
      `sha256:${createHash("sha256").update(readFileSync(rawPath)).digest("hex")}`,
    );
    expect(JSON.stringify(output)).not.toContain("secret-cookie");
    expect(existsSync(rawPath)).toBe(true);
  });

  test("refuses to send cookie to untrusted host", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);
    let fetchCalled = false;

    await expect(
      fetchLanhuRequirement(
        { url: "https://example.com/prd", outputDir: "sources/lanhu" },
        {
          rootDir,
          project: "demo",
          feature: "rule-config",
          cookie: "secret-cookie",
          fetchImpl: async () => {
            fetchCalled = true;
            return new Response("<html></html>");
          },
        },
      ),
    ).rejects.toThrow(
      "MISSING_SECRET refusing to send Lanhu cookie to untrusted host",
    );

    await expect(
      fetchLanhuRequirement(
        { url: "http://lanhu.example/prd", outputDir: "sources/lanhu" },
        {
          rootDir,
          project: "demo",
          feature: "rule-config",
          cookie: "secret-cookie",
          fetchImpl: async () => {
            fetchCalled = true;
            return new Response("<html></html>");
          },
        },
      ),
    ).rejects.toThrow(
      "MISSING_SECRET refusing to send Lanhu cookie to untrusted host",
    );

    await expect(
      fetchLanhuRequirement(
        {
          url: "https://notlanhu.attacker.test/prd",
          outputDir: "sources/lanhu",
        },
        {
          rootDir,
          project: "demo",
          feature: "rule-config",
          cookie: "secret-cookie",
          fetchImpl: async () => {
            fetchCalled = true;
            return new Response("<html></html>");
          },
        },
      ),
    ).rejects.toThrow(
      "MISSING_SECRET refusing to send Lanhu cookie to untrusted host",
    );

    await expect(
      fetchLanhuRequirement(
        { url: "https://lanhu.evil.example/prd", outputDir: "sources/lanhu" },
        {
          rootDir,
          project: "demo",
          feature: "rule-config",
          cookie: "secret-cookie",
          fetchImpl: async () => {
            fetchCalled = true;
            return new Response("<html></html>");
          },
        },
      ),
    ).rejects.toThrow(
      "MISSING_SECRET refusing to send Lanhu cookie to untrusted host",
    );
    expect(fetchCalled).toBe(false);
  });

  test("rejects path escape project and feature segments", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    await expect(
      fetchLanhuRequirement(
        { url: "https://lanhu.example/prd", outputDir: "sources/lanhu" },
        {
          rootDir,
          project: "..",
          feature: "rule-config",
          fetchImpl: async () => new Response("<html></html>"),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT invalid project path segment");

    await expect(
      fetchLanhuRequirement(
        { url: "https://lanhu.example/prd", outputDir: "sources/lanhu" },
        {
          rootDir,
          project: "demo",
          feature: "rules/config",
          fetchImpl: async () => new Response("<html></html>"),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT invalid feature path segment");
  });

  test("rejects unsupported outputDir", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-"));
    roots.push(rootDir);

    await expect(
      fetchLanhuRequirement(
        { url: "https://lanhu.example/prd", outputDir: "../lanhu" },
        {
          rootDir,
          project: "demo",
          feature: "rule-config",
          fetchImpl: async () => new Response("<html></html>"),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT outputDir must be sources/lanhu");
  });
});
