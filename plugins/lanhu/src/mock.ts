import type {
  LanhuFetchInput,
  RequirementSourceBundle,
} from "@kata-agent/domain";

export function mockFetchRequirement(
  input: LanhuFetchInput,
): RequirementSourceBundle {
  return {
    schemaVersion: "0.1",
    sourceType: "lanhu",
    sourceUrl: input.url,
    title: "规则配置",
    textBlocks: [
      {
        id: "SRC-001",
        title: "原始需求",
        content: "用户需要创建规则，但缺少保存按钮文案和成功提示。",
      },
    ],
    images: [],
    rawFiles: [],
    fetchedAt: "2026-05-01T00:00:00.000Z",
  };
}
