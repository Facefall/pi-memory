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

  return `${scaffolded}\n\n${ctx}`;
}
