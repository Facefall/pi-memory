export type MemoryStatusAction = "toggle" | "refresh" | "hide" | "expand" | "collapse";

export function parseMemoryStatusArgs(args: string | string[]): MemoryStatusAction {
  const text = (Array.isArray(args) ? args.join(" ") : args).trim().toLowerCase();
  if (!text) return "toggle";
  if (text === "hide" || text === "close" || text === "off" || text === "dismiss") return "hide";
  if (text === "refresh" || text === "reload") return "refresh";
  if (text === "expand" || text === "open" || text === "show") return "expand";
  if (text === "collapse" || text === "fold" || text === "min") return "collapse";
  return "toggle";
}
