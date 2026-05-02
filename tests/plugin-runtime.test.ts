import { describe, expect, test } from "bun:test";
import {
  PluginActionRegistry,
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
          sideEffects: {
            network: true,
            writeArtifacts: true,
            external: false,
          },
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
          inputSchema: "LanhuFetchInput",
          outputSchema: "NotificationResult",
          sideEffects: {
            network: false,
            writeArtifacts: false,
            external: false,
          },
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
          sideEffects: {
            network: false,
            writeArtifacts: true,
            external: false,
          },
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

  test("allows issue tracker plugins to output IssueSyncResult", () => {
    const manifest: PluginManifest = {
      name: "zentao",
      title: "Zentao",
      version: "0.4.0",
      type: "issue-tracker",
      actions: [
        {
          id: "zentao.syncIssue",
          title: "Sync IssueDraft to Zentao",
          inputSchema: "IssueDraft",
          outputSchema: "IssueSyncResult",
          sideEffects: {
            network: true,
            writeArtifacts: false,
            external: true,
          },
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["ZENTAO_BASE_URL", "ZENTAO_TOKEN"],
        writeScopes: [],
      },
    };
    expect(() => validatePluginManifest(manifest)).not.toThrow();
  });

  test("allows requirement writeback plugins to output LanhuWritebackResult", () => {
    const manifest: PluginManifest = {
      name: "lanhu-writeback",
      title: "Lanhu Writeback",
      version: "0.4.0",
      type: "requirement-writeback",
      actions: [
        {
          id: "lanhuWriteback.writeRequirement",
          title: "Write requirement summary back to Lanhu",
          inputSchema: "LanhuWritebackDraft",
          outputSchema: "LanhuWritebackResult",
          sideEffects: {
            network: true,
            writeArtifacts: false,
            external: true,
          },
        },
      ],
      permissions: {
        network: "restricted",
        secrets: ["LANHU_WRITEBACK_COOKIE"],
        writeScopes: [],
      },
    };
    expect(() => validatePluginManifest(manifest)).not.toThrow();
  });

  test("allows static scan plugins to output InspectionReport", () => {
    const manifest: PluginManifest = {
      name: "static-scan",
      title: "Static Scan",
      version: "0.1.0",
      type: "static-scan",
      actions: [
        {
          id: "staticScan.scanDiff",
          title: "Scan diff risks",
          inputSchema: "StaticScanInput",
          outputSchema: "InspectionReport",
          sideEffects: {
            network: false,
            writeArtifacts: false,
            external: false,
          },
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.reports"],
      },
    };
    expect(() => validatePluginManifest(manifest)).not.toThrow();
  });

  test("rejects static scan plugins that output non-inspection schemas", () => {
    const manifest: PluginManifest = {
      name: "bad-static-scan",
      title: "Bad Static Scan",
      version: "0.1.0",
      type: "static-scan",
      actions: [
        {
          id: "staticScan.createIssue",
          title: "Bad issue creation",
          inputSchema: "StaticScanInput",
          outputSchema: "IssueDraft",
          sideEffects: {
            network: false,
            writeArtifacts: false,
            external: false,
          },
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.reports"],
      },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "static-scan action outputSchema is not allowed",
    );
  });

  test("rejects network side effects when manifest denies network", () => {
    const manifest: PluginManifest = {
      name: "bad-network",
      title: "Bad Network",
      version: "0.1.0",
      type: "notification",
      actions: [
        {
          id: "notify.sendNotification",
          title: "Notify",
          inputSchema: "NotificationRequest",
          outputSchema: "NotificationResult",
          sideEffects: {
            network: true,
            writeArtifacts: false,
            external: true,
          },
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: [],
      },
    };
    expect(() => validatePluginManifest(manifest)).toThrow(
      "declares network side effect but plugin network permission is none",
    );
  });

  test("validates action input and output against manifest schemas", async () => {
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
          sideEffects: {
            network: false,
            writeArtifacts: true,
            external: false,
          },
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.sources"],
      },
    };
    const registry = new PluginActionRegistry();
    registry.registerManifest(manifest);
    registry.register("lanhu.fetchRequirement", () => ({
      schemaVersion: "0.1",
      sourceType: "lanhu",
      sourceUrl: "mock://poor-prd",
      title: "规则配置",
      textBlocks: [{ id: "SRC-001", content: "保存按钮" }],
      images: [],
      rawFiles: [],
      fetchedAt: "2026-05-02T00:00:00.000Z",
    }));

    await expect(
      registry.execute("lanhu.fetchRequirement", { url: "mock://poor-prd" }, {
        rootDir: "/tmp",
        project: "demo",
        feature: "rule-config",
      }),
    ).rejects.toThrow("SCHEMA_VALIDATION_FAILED LanhuFetchInput");

    await expect(
      registry.execute(
        "lanhu.fetchRequirement",
        { url: "mock://poor-prd", outputDir: "sources/lanhu" },
        {
          rootDir: "/tmp",
          project: "demo",
          feature: "rule-config",
        },
      ),
    ).resolves.toMatchObject({ schemaVersion: "0.1" });
  });

  test("rejects invalid action output", async () => {
    const manifest: PluginManifest = {
      name: "static-scan",
      title: "Static Scan",
      version: "0.1.0",
      type: "static-scan",
      actions: [
        {
          id: "staticScan.scanDiff",
          title: "Scan diff risks",
          inputSchema: "StaticScanInput",
          outputSchema: "InspectionReport",
          sideEffects: {
            network: false,
            writeArtifacts: false,
            external: false,
          },
        },
      ],
      permissions: {
        network: "none",
        secrets: [],
        writeScopes: ["feature.reports"],
      },
    };
    const registry = new PluginActionRegistry();
    registry.registerManifest(manifest);
    registry.register("staticScan.scanDiff", () => ({ schemaVersion: "0.1" }));

    await expect(
      registry.execute(
        "staticScan.scanDiff",
        {
          schemaVersion: "0.1",
          project: "demo",
          feature: "rule-config",
          sourceRepoRef: "SourceRepoRef:1",
          diffText: "diff --git a/app.ts b/app.ts\n+console.log('x')\n",
        },
        {
          rootDir: "/tmp",
          project: "demo",
          feature: "rule-config",
        },
      ),
    ).rejects.toThrow("SCHEMA_VALIDATION_FAILED InspectionReport");
  });
});
