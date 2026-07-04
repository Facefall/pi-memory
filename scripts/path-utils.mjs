/** Postinstall mirror of src/utils/paths.ts expandHomePath — keep in sync. */
import { homedir } from "node:os";
import { join } from "node:path";

export function expandHomePath(input) {
  const trimmed = input.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}
