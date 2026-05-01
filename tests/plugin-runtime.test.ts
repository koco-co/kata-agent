import { describe, expect, test } from "bun:test";
import {
  PluginRegistry,
  validatePluginManifest,
  type PluginManifest,
} from "../packages/plugin-runtime/src/index";

describe("plugin runtime", () => {
  test("registers and resolves plugin actions", () => {
    const registry = new PluginRegistry();
    const manifest: PluginManifest = {
      name: "lanhu",
      title: "蓝湖需求源",
      version: "0.1.0",
      type: "requirement-source",
      actions: [
        {
          id: "lanhu.fetchRequirement",
          title: "拉取蓝湖需求",
          inputSchema: "LanhuFetchInput",
          outputSchema: "RequirementSourceBundle",
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["LANHU_COOKIE"],
        writeScopes: ["feature.sources"],
      },
    };
    registry.register(manifest);
    expect(registry.findAction("lanhu.fetchRequirement")?.name).toBe("lanhu");
  });

  test("rejects source plugins that output non-source schemas", () => {
    const manifest: PluginManifest = {
      name: "bad",
      title: "bad",
      version: "0.1.0",
      type: "requirement-source",
      actions: [
        {
          id: "bad.notify",
          title: "bad",
          inputSchema: "Anything",
          outputSchema: "NotificationResult",
        },
      ],
      permissions: { network: "open", secrets: [], writeScopes: [] },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "requirement-source action outputSchema is not allowed",
    );
  });

  test("rejects export plugins that output non-export schemas", () => {
    const manifest: PluginManifest = {
      name: "bad-export",
      title: "bad export",
      version: "0.1.0",
      type: "artifact-export",
      actions: [
        {
          id: "xmind.export",
          title: "bad",
          inputSchema: "TestSpec",
          outputSchema: "TestSpec",
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.exports"],
      },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "artifact-export action outputSchema is not allowed",
    );
  });
});
