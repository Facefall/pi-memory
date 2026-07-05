// Agent 侧：发送请求到 sidecar
import { randomUUID } from "node:crypto";
import net from "node:net";

import {
  SIDECAR_PING_TIMEOUT_MS,
  SIDECAR_QUERY_TIMEOUT_MS,
  SIDECAR_REINDEX_TIMEOUT_MS,
} from "../constants/timing.js";
import { JsonlFramer, parseJsonlLine, serializeJsonlFrame } from "../utils/jsonl.js";
import { isErrorResponse, type IndexDocument, type IndexStats, type SidecarResponse } from "./protocol.js";

export type SidecarRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function sidecarRequest<T extends SidecarResponse>(
  socketPath: string,
  frame: Record<string, unknown>,
  options: SidecarRequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? SIDECAR_QUERY_TIMEOUT_MS;
  const { signal } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    const socket = net.connect(socketPath);
    const framer = new JsonlFramer();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const succeed = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onAbort = () => {
      fail(abortError(signal!));
    };

    const timer = setTimeout(() => {
      fail(new Error("Sidecar request timed out"));
    }, timeoutMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    socket.on("connect", () => {
      socket.write(serializeJsonlFrame(frame));
    });

    socket.on("data", (chunk) => {
      for (const line of framer.push(chunk.toString())) {
        socket.end();

        let response: SidecarResponse;
        try {
          response = parseJsonlLine<SidecarResponse>(line);
        } catch {
          fail(new Error("Invalid JSON response from sidecar"));
          return;
        }

        if (isErrorResponse(response)) {
          fail(new Error(response.error));
          return;
        }

        succeed(response as T);
        return;
      }
    });

    socket.on("error", (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Aborted");
}

export async function ping(socketPath: string): Promise<boolean> {
  try {
    const res = await sidecarRequest<Extract<SidecarResponse, { type: "pong" }>>(
      socketPath,
      { type: "ping" },
      { timeoutMs: SIDECAR_PING_TIMEOUT_MS },
    );
    return res.type === "pong";
  } catch {
    return false;
  }
}

export async function fetchIndexStats(
  socketPath: string,
): Promise<{ stats: IndexStats } | { error: string }> {
  try {
    const res = await sidecarRequest<Extract<SidecarResponse, { type: "stats_ok" }>>(
      socketPath,
      { type: "stats" },
      { timeoutMs: SIDECAR_PING_TIMEOUT_MS },
    );
    if (res.type !== "stats_ok") return { error: "unexpected sidecar response" };
    const { type: _type, ...stats } = res;
    return { stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function query(
  socketPath: string,
  queryText: string,
  options: SidecarRequestOptions = {},
) {
  const request_id = randomUUID();
  return sidecarRequest<Extract<SidecarResponse, { type: "result" }>>(
    socketPath,
    { type: "query", request_id, query: queryText },
    options,
  );
}

export type ReindexResult = Extract<SidecarResponse, { type: "reindex_ok" }>;

export async function reindex(
  socketPath: string,
  documents: IndexDocument[] = [],
): Promise<ReindexResult> {
  const request_id = randomUUID();
  return sidecarRequest<ReindexResult>(
    socketPath,
    { type: "reindex", request_id, documents },
    { timeoutMs: SIDECAR_REINDEX_TIMEOUT_MS },
  );
}
