import type { IndexDocument, SidecarResponse } from "../protocol.js";
import { getVecStore } from "./vec/store.js";

export type ReindexContext = {
  dbPath: string;
};

export async function handleReindex(
  requestId: string,
  ctx: ReindexContext,
  documents: IndexDocument[] = [],
): Promise<Extract<SidecarResponse, { type: "reindex_ok" }>> {
  if (documents.length === 0) {
    return { type: "reindex_ok", request_id: requestId, indexed: 0 };
  }

  const store = getVecStore(ctx.dbPath);
  const indexed = await store.reindex(documents);
  return { type: "reindex_ok", request_id: requestId, indexed };
}
