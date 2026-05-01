import type { SkillManifest } from "./types";

export class SkillRegistry {
  private readonly manifests = new Map<string, SkillManifest>();

  register(manifest: SkillManifest): void {
    if (this.manifests.has(manifest.name)) {
      throw new Error(`Skill already registered: ${manifest.name}`);
    }
    this.manifests.set(manifest.name, manifest);
  }

  get(name: string): SkillManifest | null {
    return this.manifests.get(name) ?? null;
  }

  list(): SkillManifest[] {
    return [...this.manifests.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}
