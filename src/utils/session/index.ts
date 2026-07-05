import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function readParentSession(header: Record<string, unknown> | null): string | undefined {
  const parent = header?.parentSession ?? header?.parent_session;
  return typeof parent === "string" && parent.trim().length > 0 ? parent.trim() : undefined;
}

export function isSubagentSession(ctx: ExtensionContext): boolean {
  const header = ctx.sessionManager.getHeader() as unknown as Record<string, unknown> | null;
  return readParentSession(header) !== undefined;
}
