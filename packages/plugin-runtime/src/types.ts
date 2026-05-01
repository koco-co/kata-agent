export type PluginType =
  | "requirement-source"
  | "artifact-export"
  | "automation"
  | "notification"
  | "issue-tracker"
  | "rule-source";
export type NetworkPermission = "none" | "restricted" | "open";

export interface PluginActionManifest {
  id: string;
  title: string;
  inputSchema: string;
  outputSchema: string;
  sideEffects?: {
    network?: boolean;
    writeArtifacts?: boolean;
    external?: boolean;
  };
}

export interface PluginPermissions {
  network: NetworkPermission;
  secrets: string[];
  writeScopes: string[];
}

export interface PluginManifest {
  name: string;
  title: string;
  version: string;
  type: PluginType;
  actions: PluginActionManifest[];
  permissions: PluginPermissions;
}
