import type { TestSpec, XMindExport } from "../../../packages/domain/src/index";

export function mockExportXMind(input: TestSpec): XMindExport {
  const caseCount = input.modules.reduce(
    (total, module) => total + module.cases.length,
    0,
  );
  return {
    schemaVersion: "0.1",
    outputPath: "exports/xmind/test-spec.xmind",
    caseCount,
  };
}
