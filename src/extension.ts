/**
 * @deprecated Use `@chendpoc/pi-memory/extension` (pi-extension.ts) with real ExtensionAPI.
 * Re-exports the Pi extension entry for backward compatibility.
 */
export { default, default as piMemoryExtension, getSharedMemoryService } from "./pi-extension.js";
export type { BeforeTurnHook, MemoryHelperLLM } from "./preflight/hook.js";
export { createBeforeTurnHook } from "./preflight/hook.js";

/** @deprecated Stub types kept for programmatic callers migrating off the old API. */
export interface PiExtensionAPI {
  config?: Record<string, unknown>;
  registerTool(tool: PiAgentTool): void;
  onBeforeTurn?(hook: import("./preflight/hook.js").BeforeTurnHook): void;
  onUnload?(fn: () => void | Promise<void>): void;
}

/** @deprecated */
export interface PiAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx?: { signal?: AbortSignal }): Promise<string>;
}
