import type { SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

import type { LlmClient } from "../adapters/llm/types.js";
import { stripPrivateMemoryFromMessages } from "../utils/memory/index.js";
import { buildCompactionSummaryPrompt } from "./summaryPrompt.js";

type CompactionPreparation = SessionBeforeCompactEvent["preparation"];

export async function runDualPurposeCompactionSummary(
  preparation: CompactionPreparation,
  llm: LlmClient,
  signal?: AbortSignal,
): Promise<string | null> {
  const allMessages = stripPrivateMemoryFromMessages([
    ...preparation.messagesToSummarize,
    ...preparation.turnPrefixMessages,
  ]);

  const conversationText = serializeConversation(convertToLlm(allMessages));
  const prompt = buildCompactionSummaryPrompt(conversationText, preparation.previousSummary);
  const summary = await llm.complete(prompt, signal);
  return summary.trim() || null;
}
