import type { PluginManifest } from "./types";

const PLUGIN_OUTPUT_CONTRACTS: Record<string, readonly string[]> = {
  "requirement-source": ["RequirementSourceBundle"],
  "artifact-export": ["XMindExport"],
  automation: ["RunRecord", "EvidencePack"],
  notification: ["NotificationResult"],
  "issue-tracker": ["IssueSyncResult"],
  "rule-source": ["RuleSet"],
};

export function validatePluginManifest(manifest: PluginManifest): void {
  const allowedOutputs = PLUGIN_OUTPUT_CONTRACTS[manifest.type] ?? [];
  for (const action of manifest.actions) {
    if (!allowedOutputs.includes(action.outputSchema)) {
      throw new Error(
        `${manifest.type} action outputSchema is not allowed: ${action.id} -> ${action.outputSchema}`,
      );
    }
  }
}
