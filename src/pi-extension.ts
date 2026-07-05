import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadEnv, resolveMemoryAgentDir } from "./config/index.js";
import { registerCommands } from "./commands/index.js";
import { registerCompactHandlers } from "./compact/register.js";
import { createMemoryRuntime, type MemoryRuntime } from "./extension/createMemoryRuntime.js";

loadEnv();

export default function piMemoryExtension(pi: ExtensionAPI): void {
  let runtime: MemoryRuntime | null = null;

  pi.on("session_start", async (_event, ctx) => {
    if (runtime) {
      await runtime.dispose();
      runtime = null;
    }
    runtime = createMemoryRuntime({ ctx });
    await runtime.bootstrap(ctx, pi);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    if (!runtime) return;
    await runtime.shutdown(event, ctx);
    await runtime.dispose();
    runtime = null;
  });

  pi.on("model_select", async (_event, ctx) => {
    await runtime?.refreshLlm(ctx, pi);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await runtime?.runBeforeAgentStart(event, ctx);
  });

  pi.on("context", async (event, ctx) => {
    return runtime?.runContext(event, ctx);
  });

  registerCommands(pi, {
    getMemoryStore: () => runtime?.store ?? null,
    onRemembered: async () => {
      await runtime?.reloadSessionMemoryCap();
    },
    getAgentDir: () => runtime?.store.agentDir ?? resolveMemoryAgentDir(),
  });

  registerCompactHandlers(pi, {
    getMemoryStore: () => runtime?.store ?? null,
    getLlmClient: () => runtime?.getLlm() ?? null,
    onCompactionIngested: async () => {
      await runtime?.reloadSessionMemoryCap();
    },
  });
}

export { piMemoryExtension };
