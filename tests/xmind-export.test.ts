import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import JSZip from "jszip";
import type { TestSpec } from "../packages/domain/src/index";
import { exportXMindFile } from "../plugins/xmind/src/exporter";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("XMind export", () => {
  test("writes a real xmind zip for a test spec", async () => {
    const featureDir = mkdtempSync(join(tmpdir(), "kata-agent-xmind-"));
    roots.push(featureDir);
    const input: TestSpec = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      title: "Rule Config Test Spec",
      requirementRef: "requirements/spec.json",
      status: "reviewed",
      modules: [
        {
          id: "module-rules",
          name: "Rules",
          requirementRefs: ["REQ-1"],
          cases: [
            {
              id: "case-save-rule",
              title: "Save a rule",
              priority: "P0",
              requirementRefs: ["REQ-1"],
              steps: [
                {
                  id: "step-save",
                  action: "Click save",
                  expected: "Rule is saved",
                  requirementRefs: ["REQ-1"],
                },
              ],
              assertions: [
                {
                  id: "assert-toast",
                  layer: "L2",
                  kind: "ui",
                  target: "toast",
                  expected: "success message appears",
                  requirementRefs: ["REQ-1"],
                },
              ],
              automation: {
                surface: "web",
                readiness: "ready",
                uiContractRefs: ["ui-save-button"],
                blockers: [],
              },
              traceability: {
                requirementRefs: ["REQ-1"],
                sourceRefs: ["lanhu://rule-config"],
              },
            },
          ],
        },
      ],
    };

    const output = await exportXMindFile(input, featureDir);
    const outputPath = join(featureDir, output.outputPath);
    const zip = await JSZip.loadAsync(readFileSync(outputPath));
    const contentFile = zip.file("content.json");
    const metadataFile = zip.file("metadata.json");
    const manifestFile = zip.file("manifest.json");

    expect(output).toEqual({
      schemaVersion: "0.1",
      outputPath: "exports/xmind/test-spec.xmind",
      caseCount: 1,
    });
    expect(existsSync(outputPath)).toBe(true);
    expect(contentFile).not.toBeNull();
    expect(metadataFile).not.toBeNull();
    expect(manifestFile).not.toBeNull();

    const content = JSON.parse(await contentFile!.async("string"));
    const metadata = JSON.parse(await metadataFile!.async("string"));
    const manifest = JSON.parse(await manifestFile!.async("string"));

    expect(JSON.stringify(content)).toContain("P0 Save a rule");
    expect(content).toEqual([
      {
        id: "sheet-1",
        title: "Rule Config Test Spec",
        rootTopic: {
          id: "root",
          title: "Rule Config Test Spec",
          children: {
            attached: [
              {
                id: "module-rules",
                title: "Rules",
                children: {
                  attached: [
                    {
                      id: "case-save-rule",
                      title: "P0 Save a rule",
                      children: {
                        attached: [
                          {
                            id: "assert-toast",
                            title: "L2 toast: success message appears",
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ]);
    expect(metadata).toEqual({ creator: "kata-agent", version: "0.1" });
    expect(manifest).toEqual({
      "file-entries": {
        "content.json": {},
        "metadata.json": {},
      },
    });
  });
});
