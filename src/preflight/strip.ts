const PRIVATE_MEMORY_OPEN = "<private_memory>";
const PRIVATE_MEMORY_CLOSE = "</private_memory>";

/**
 * Remove all well-formed <private_memory>…</private_memory> blocks from text.
 * Unterminated open markers are left untouched (fail-safe).
 */
export function stripPrivateMemory(text: string): string {
  let s = text;
  for (;;) {
    const i = s.indexOf(PRIVATE_MEMORY_OPEN);
    if (i < 0) return s;
    const rel = s.indexOf(PRIVATE_MEMORY_CLOSE, i);
    if (rel < 0) return s;

    let end = rel + PRIVATE_MEMORY_CLOSE.length;
    while (end < s.length && /[\n\r \t]/.test(s[end]!)) end++;

    let start = i;
    while (start > 0 && /[ \t]/.test(s[start - 1]!)) start--;
    if (start > 0 && s[start - 1] === "\n") {
      start--;
      if (start > 0 && s[start - 1] === "\r") start--;
    }

    s = s.slice(0, start) + s.slice(end);
  }
}

/**
 * Inject private memory context before the user payload in a scaffolded message.
 * Mirrors Kocoro injectPrivateMemoryContext.
 */
export function injectPrivateMemoryContext(
  scaffolded: string,
  userPayload: string,
  privateContext: string,
): string {
  const ctx = privateContext.trim();
  if (!ctx) return scaffolded;
  if (userPayload && scaffolded.endsWith(userPayload)) {
    return (
      scaffolded.slice(0, scaffolded.length - userPayload.length) +
      ctx +
      "\n\n" +
      userPayload
    );
  }
  return scaffolded + "\n\n" + ctx;
}
