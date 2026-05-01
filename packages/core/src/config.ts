export interface ConfigLoader {
  loadEnv(): Record<string, string>;
  resolveSecret(name: string): string | undefined;
  loadProjectConfig(project: string): unknown;
}
