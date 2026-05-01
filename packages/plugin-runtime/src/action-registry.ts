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

  register(actionId: string, handler: PluginActionHandler): void {
    if (this.handlers.has(actionId)) {
      throw new Error(`Action already registered: ${actionId}`);
    }
    this.handlers.set(actionId, handler);
  }

  async execute(
    actionId: string,
    input: unknown,
    context: PluginActionContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(actionId);
    if (!handler) throw new Error(`Action not registered: ${actionId}`);
    return handler(input, context);
  }
}
