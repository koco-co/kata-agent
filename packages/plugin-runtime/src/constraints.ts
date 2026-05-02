import type { PluginManifest } from "./types";
import { SCHEMA_REGISTRY } from "../../domain/src/index";

const PLUGIN_OUTPUT_CONTRACTS: Record<string, readonly string[]> = {
  "requirement-source": ["RequirementSourceBundle"],
  "artifact-export": ["XMindExport", "HtmlReport"],
  automation: ["RunRecord", "EvidencePack"],
  notification: ["NotificationResult"],
  "issue-tracker": ["IssueSyncResult"],
  "requirement-writeback": ["LanhuWritebackResult"],
  "rule-source": ["RuleSet"],
  "static-scan": ["InspectionReport"],
};

export function validatePluginManifest(manifest: PluginManifest): void {
  const allowedOutputs = PLUGIN_OUTPUT_CONTRACTS[manifest.type] ?? [];
  for (const action of manifest.actions) {
    if (!isKnownSchema(action.inputSchema)) {
      throw new Error(`SCHEMA_REFERENCE_NOT_FOUND ${action.inputSchema}`);
    }
    if (!isKnownSchema(action.outputSchema)) {
      throw new Error(`SCHEMA_REFERENCE_NOT_FOUND ${action.outputSchema}`);
    }
    if (!allowedOutputs.includes(action.outputSchema)) {
      throw new Error(
        `${manifest.type} action outputSchema is not allowed: ${action.id} -> ${action.outputSchema}`,
      );
    }
    if (action.sideEffects.network && manifest.permissions.network === "none") {
      throw new Error(
        `${action.id} declares network side effect but plugin network permission is none`,
      );
    }
    if (
      action.sideEffects.writeArtifacts &&
      manifest.permissions.writeScopes.length === 0
    ) {
      throw new Error(
        `${action.id} declares artifact writes but plugin writeScopes is empty`,
      );
    }
  }
}

function isKnownSchema(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCHEMA_REGISTRY, value);
}
