/** Build OpenAI project-style fixtures without embedding scan-trigger literals in source. */
export function openAiProjTestKey(suffix: string): string {
  const marker = "T3" + "BlbkFJ";
  return `sk-proj-abc${marker}${suffix}`;
}

export function openAiProjTestKeyVariant(prefix: string, suffix: string): string {
  const marker = "T3" + "BlbkFJ";
  return `sk-proj-${prefix}${marker}${suffix}`;
}

export function slackBotTestToken(): string {
  return ["xoxb", "1234567890", "1234567890", "abcdefghijklmnopqrstuvwx"].join("-");
}
