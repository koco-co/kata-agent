import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { ConfigLoader } from "./config";

export interface LocalConfigLoaderOptions {
  rootDir: string;
  env?: Record<string, string | undefined>;
}

export class LocalConfigLoader implements ConfigLoader {
  constructor(private readonly options: LocalConfigLoaderOptions) {}

  loadEnv(): Record<string, string> {
    const file = join(this.options.rootDir, ".env");
    const values: Record<string, string> = {};
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index <= 0) continue;
        values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }
    }
    for (const [key, value] of Object.entries(this.options.env ?? process.env)) {
      if (typeof value === "string") values[key] = value;
    }
    return values;
  }

  resolveSecret(name: string): string | undefined {
    return this.loadEnv()[name];
  }

  loadProjectConfig(project: string): unknown {
    const file = join(this.options.rootDir, "projects", project, "project.yaml");
    if (!existsSync(file)) return {};
    return YAML.parse(readFileSync(file, "utf8"));
  }
}
