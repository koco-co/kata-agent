import type { TestSpec, XMindExport } from "@kata-agent/domain";

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
