import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import type { TestSpec, XMindExport } from "../../../packages/domain/src/index";

interface XMindTopic {
  id: string;
  title: string;
  children?: {
    attached: XMindTopic[];
  };
}

function withChildren(id: string, title: string, attached: XMindTopic[]): XMindTopic {
  if (attached.length === 0) {
    return { id, title };
  }
  return {
    id,
    title,
    children: { attached },
  };
}

export async function exportXMindFile(
  input: TestSpec,
  featureDir: string,
): Promise<XMindExport> {
  const rootTopic = withChildren(
    "root",
    input.title,
    input.modules.map((module) =>
      withChildren(
        module.id,
        module.name,
        module.cases.map((testCase) =>
          withChildren(
            testCase.id,
            `${testCase.priority} ${testCase.title}`,
            testCase.assertions.map((assertion) => ({
              id: assertion.id,
              title: `${assertion.layer} ${assertion.target}: ${assertion.expected}`,
            })),
          ),
        ),
      ),
    ),
  );
  const content = [{ id: "sheet-1", title: input.title, rootTopic }];
  const metadata = { creator: "kata-agent", version: "0.1" };
  const manifest = {
    "file-entries": {
      "content.json": {},
      "metadata.json": {},
    },
  };
  const outputPath = "exports/xmind/test-spec.xmind";
  const absoluteOutputPath = join(featureDir, outputPath);
  const zip = new JSZip();

  zip.file("content.json", JSON.stringify(content, null, 2));
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, await zip.generateAsync({ type: "nodebuffer" }));

  return {
    schemaVersion: "0.1",
    outputPath,
    caseCount: input.modules.reduce(
      (total, module) => total + module.cases.length,
      0,
    ),
  };
}
