export interface SkillManifest {
  name: string;
  title: string;
  version: string;
  description: string;
  workflow: string;
  inputs?: { schema: string };
  outputs?: string[];
  requiredPlugins?: string[];
  status?: "full" | "interface-only" | "planned";
}
