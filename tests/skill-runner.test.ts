import { describe, expect, test } from "bun:test";
import {
  SkillRegistry,
  SkillRunner,
  type SkillManifest,
} from "../packages/skill-runner/src/index";

describe("skill registry", () => {
  test("registers and lists skills", () => {
    const registry = new SkillRegistry();
    const manifest: SkillManifest = {
      name: "test-case-gen",
      title: "测试用例生成",
      version: "0.1.0",
      description: "生成测试资产",
      workflow: "test-case-gen",
      outputs: ["TestSpec"],
    };

    registry.register(manifest);

    expect(registry.get("test-case-gen")?.workflow).toBe("test-case-gen");
    expect(registry.list()).toHaveLength(1);
    expect(new SkillRunner()).toBeInstanceOf(SkillRunner);
  });
});
