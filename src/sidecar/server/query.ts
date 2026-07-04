import type { MemoryEntry, SidecarResponse } from "../protocol.js";
import { getVecStore } from "./vec/store.js";

export type QueryContext = {
  dbPath: string;
};

export async function handleQuery(
  requestId: string,
  queryText: string,
  ctx: QueryContext,
): Promise<Extract<SidecarResponse, { type: "result" }>> {
  const store = getVecStore(ctx.dbPath);
  const results: MemoryEntry[] = await store.query(queryText);
  return { type: "result", request_id: requestId, results };
}
