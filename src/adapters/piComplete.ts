import { complete, getEnvApiKey, getModels } from "@earendil-works/pi-ai/compat";
import type { Api, Model, ProviderEnv, ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  COMPILE_MEMORY_INTENTS_PARAMETERS,
  MEMORY_HELPER_TOOL_NAME,
  type CompileMemoryIntentsResult,
  type MemoryHelperLLM,
} from "../preflight/detectIntents.js";
import type { LLMClient } from "../trainer/llmExtractor.js";

export const DEFAULT_HELPER_PROVIDER = "deepseek";
export const DEFAULT_HELPER_MODEL = "deepseek-v4-flash";

const CompileMemoryIntentsParams = Type.Unsafe(COMPILE_MEMORY_INTENTS_PARAMETERS);

export function parseModelSpec(
  spec: string | boolean | undefined,
  defaultProvider = DEFAULT_HELPER_PROVIDER,
  defaultModelId = DEFAULT_HELPER_MODEL,
): { provider: string; modelId: string } {
  if (typeof spec !== "string" || !spec.trim()) {
    return { provider: defaultProvider, modelId: defaultModelId };
  }
  const trimmed = spec.trim();
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { provider: defaultProvider, modelId: trimmed };
  }
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

async function resolveModelAuth(
  ctx: ExtensionContext,
  provider: string,
  modelId: string,
): Promise<{ model: Model<Api>; apiKey: string; headers?: Record<string, string>; env?: ProviderEnv } | null> {
  const model = ctx.modelRegistry.find(provider, modelId);
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  return {
    model,
    apiKey: auth.apiKey,
    headers: auth.headers,
    env: auth.env,
  };
}

function extractTextFromResponse(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function findToolCall(
  content: Array<{ type: string; name?: string; arguments?: Record<string, unknown> }>,
  toolName: string,
): ToolCall | null {
  for (const block of content) {
    if (block.type === "toolCall" && block.name === toolName && block.arguments) {
      return block as ToolCall;
    }
  }
  return null;
}

function buildMemoryHelperLLM(
  resolved: NonNullable<Awaited<ReturnType<typeof resolveModelAuth>>>,
): MemoryHelperLLM {
  return {
    async compileIntents(text: string, signal?: AbortSignal): Promise<CompileMemoryIntentsResult> {
      const response = await complete(
        resolved.model,
        {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze whether the user message requires recalling private episodic memory.\n\n<message>\n${text}\n</message>`,
                },
              ],
              timestamp: Date.now(),
            },
          ],
          tools: [
            {
              name: MEMORY_HELPER_TOOL_NAME,
              description:
                "Decide whether to recall private episodic memory and compile structured query intents.",
              parameters: CompileMemoryIntentsParams,
            },
          ],
        },
        {
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          env: resolved.env,
          signal,
          toolChoice: { type: "tool", name: MEMORY_HELPER_TOOL_NAME },
        },
      );

      const toolCall = findToolCall(response.content, MEMORY_HELPER_TOOL_NAME);
      if (toolCall?.arguments) {
        return toolCall.arguments as CompileMemoryIntentsResult;
      }

      const raw = extractTextFromResponse(response.content);
      if (!raw.trim()) {
        return { should_recall: false, intents: [] };
      }
      return JSON.parse(raw) as CompileMemoryIntentsResult;
    },
  };
}

/** Resolve helper LLM when model + auth are available; otherwise null (regex-only preflight). */
export async function resolveMemoryHelperLLM(
  ctx: ExtensionContext,
  modelSpec: string | boolean | undefined,
): Promise<MemoryHelperLLM | null> {
  const { provider, modelId } = parseModelSpec(modelSpec);
  const resolved = await resolveModelAuth(ctx, provider, modelId);
  if (!resolved) return null;
  return buildMemoryHelperLLM(resolved);
}

/** @alias resolveMemoryHelperLLM */
export const createMemoryHelperLLM = resolveMemoryHelperLLM;

export function createPiLLMClient(
  ctx: ExtensionContext,
  modelSpec: string | boolean | undefined,
): LLMClient | null {
  const { provider, modelId } = parseModelSpec(modelSpec);

  return {
    async complete(prompt: string): Promise<string> {
      const resolved = await resolveModelAuth(ctx, provider, modelId);
      if (!resolved) {
        throw new Error(`LLM model not available: ${provider}/${modelId}`);
      }

      const response = await complete(
        resolved.model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          env: resolved.env,
          maxTokens: 8192,
        },
      );

      const text = extractTextFromResponse(response.content);
      if (!text.trim()) {
        throw new Error("LLM response was empty");
      }
      return text;
    },
  };
}

/** Standalone LLM client for CLI usage without ExtensionContext. */
export function createStandaloneLLMClient(
  modelSpec?: string,
  env: NodeJS.ProcessEnv = process.env,
): LLMClient {
  const { provider, modelId } = parseModelSpec(modelSpec);
  const providerEnv = toProviderEnv(env);
  const model = getModels(provider as Parameters<typeof getModels>[0]).find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`Model not found: ${provider}/${modelId}`);
  }

  const apiKey = getEnvApiKey(provider, providerEnv);
  if (!apiKey) {
    throw new Error(`No API key for ${provider} — set the provider env var or use regex extractor`);
  }

  return {
    async complete(prompt: string): Promise<string> {
      const response = await complete(
        model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey,
          maxTokens: 8192,
          env: providerEnv,
        },
      );

      const text = extractTextFromResponse(response.content);
      if (!text.trim()) {
        throw new Error("LLM response was empty");
      }
      return text;
    },
  };
}

function toProviderEnv(env: NodeJS.ProcessEnv): ProviderEnv {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
