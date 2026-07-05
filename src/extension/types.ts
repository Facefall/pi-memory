import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext, SessionShutdownEvent } from "@earendil-works/pi-coding-agent";

import type { LlmClient } from "../adapters/llm/types.js";
import type { SidecarPaths } from "../sidecar/paths.js";
import type { MemoryStore } from "../store/memoryStore.js";

export type TurnPreflight = {
  userPayload: string;
  privateContext: string;
};

export type MemoryRuntime = {
  readonly store: MemoryStore;
  readonly sidecarPaths: SidecarPaths;
  readonly sessionId: string | null;
  readonly isSubagent: boolean;

  getLlm(): LlmClient | null;
  getSessionMemoryCap(): string | null;
  getTurnPreflight(): TurnPreflight | null;

  bootstrap(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void>;
  refreshLlm(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void>;
  runBeforeAgentStart(event: { prompt?: unknown }, ctx: ExtensionContext): Promise<void>;
  runContext(
    event: { messages: AgentMessage[] },
    ctx: ExtensionContext,
  ): Promise<{ messages: AgentMessage[] } | undefined>;
  shutdown(event: SessionShutdownEvent, ctx: ExtensionContext): Promise<void>;
  reloadSessionMemoryCap(): Promise<void>;
  dispose(): Promise<void>;
};

export type CreateMemoryRuntimeOptions = {
  ctx: ExtensionContext;
  agentDir?: string;
};
