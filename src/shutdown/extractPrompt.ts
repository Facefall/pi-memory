export function buildShutdownMemoryExportPrompt(conversationText: string): string {
  return `Extract durable cross-session facts from this coding-agent conversation.

Output markdown ONLY under these optional subsections:
### Preferences
### Conventions
### Findings
### Todos

Rules:
- One bullet per standalone fact (no pronouns like "we" without context).
- Skip subsections with nothing new; output nothing if there are no durable facts.
- Do NOT include session progress, next actions, or ephemeral tool noise.
- Do NOT include <private_memory> blocks.

<conversation>
${conversationText}
</conversation>`;
}

/** Wrap shutdown LLM output for parseMemoryExport(). */
export function wrapShutdownExportMarkdown(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (/^##\s+Memory Export\s*$/im.test(trimmed)) return trimmed;
  return `## Memory Export\n${trimmed}`;
}
