import {
  assertValidSchema,
  SCHEMA_REGISTRY,
  type SchemaName,
} from "../../domain/src/index";
import { validatePluginManifest } from "./constraints";
import type { PluginActionManifest, PluginManifest } from "./types";

export interface PluginActionContext {
  rootDir: string;
  project: string;
  feature: string;
}

export type PluginActionHandler = (
  input: unknown,
  context: PluginActionContext,
) => Promise<unknown> | unknown;

export class PluginActionRegistry {
  private readonly handlers = new Map<string, PluginActionHandler>();
  private readonly manifests = new Map<string, PluginActionManifest>();

  register(actionId: string, handler: PluginActionHandler): void {
    if (this.handlers.has(actionId)) {
      throw new Error(`Action already registered: ${actionId}`);
    }
    this.handlers.set(actionId, handler);
  }

  registerManifest(manifest: PluginManifest): void {
    validatePluginManifest(manifest);
    for (const action of manifest.actions) {
      if (this.manifests.has(action.id)) {
        throw new Error(`Action manifest already registered: ${action.id}`);
      }
      this.manifests.set(action.id, action);
    }
  }

  async execute(
    actionId: string,
    input: unknown,
    context: PluginActionContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(actionId);
    if (!handler) throw new Error(`Action not registered: ${actionId}`);
    const manifest = this.manifests.get(actionId);
    if (manifest) {
      assertValidSchema(schemaName(manifest.inputSchema), input);
    }
    const output = await handler(input, context);
    if (manifest) {
      assertValidSchema(schemaName(manifest.outputSchema), output);
    }
    return output;
  }
}

function schemaName(value: string): SchemaName {
  if (Object.prototype.hasOwnProperty.call(SCHEMA_REGISTRY, value)) {
    return value as SchemaName;
  }
  throw new Error(`SCHEMA_REFERENCE_NOT_FOUND ${value}`);
}
