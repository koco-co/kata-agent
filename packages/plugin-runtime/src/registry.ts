import { validatePluginManifest } from "./constraints";
import type { PluginManifest } from "./types";

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();

  register(manifest: PluginManifest): void {
    validatePluginManifest(manifest);
    if (this.manifests.has(manifest.name)) {
      throw new Error(`Plugin already registered: ${manifest.name}`);
    }
    this.manifests.set(manifest.name, manifest);
  }

  list(): PluginManifest[] {
    return [...this.manifests.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  findAction(actionId: string): PluginManifest | null {
    return (
      this.list().find((manifest) =>
        manifest.actions.some((action) => action.id === actionId),
      ) ?? null
    );
  }
}
