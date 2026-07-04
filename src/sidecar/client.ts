// Agent 侧：发送请求到 sidecar
import { randomUUID } from "node:crypto";
import net from "node:net";

import {
  SIDECAR_PING_TIMEOUT_MS,
  SIDECAR_QUERY_TIMEOUT_MS,
  SIDECAR_REINDEX_TIMEOUT_MS,
} from "../constants/timing.js";
import { isErrorResponse, type IndexDocument, type SidecarResponse } from "./protocol.js";

export function sidecarRequest<T extends SidecarResponse>(
  socketPath: string,
  frame: Record<string, unknown>,
  timeoutMs = SIDECAR_QUERY_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    let buffer = "";

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Sidecar request timed out"));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify(frame) + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const idx = buffer.indexOf("\n");
      if (idx === -1) return;
      clearTimeout(timer);
      socket.end();

      let response: SidecarResponse;
      try {
        response = JSON.parse(buffer.slice(0, idx)) as SidecarResponse;
      } catch {
        reject(new Error("Invalid JSON response from sidecar"));
        return;
      }

      if (isErrorResponse(response)) {
        reject(new Error(response.error));
        return;
      }

      resolve(response as T);
    });

    socket.on("error", reject);
  });
}

export async function ping(socketPath: string): Promise<boolean> {
  try {
    const res = await sidecarRequest<Extract<SidecarResponse, { type: "pong" }>>(
      socketPath,
      { type: "ping" },
      SIDECAR_PING_TIMEOUT_MS,
    );
    return res.type === "pong";
  } catch {
    return false;
  }
}

export async function query(socketPath: string, queryText: string) {
  const request_id = randomUUID();
  return sidecarRequest<Extract<SidecarResponse, { type: "result" }>>(
    socketPath,
    { type: "query", request_id, query: queryText },
    SIDECAR_QUERY_TIMEOUT_MS,
  );
}

export async function reindex(socketPath: string, documents: IndexDocument[] = []) {
  const request_id = randomUUID();
  return sidecarRequest<Extract<SidecarResponse, { type: "reindex_ok" }>>(
    socketPath,
    { type: "reindex", request_id, documents },
    SIDECAR_REINDEX_TIMEOUT_MS,
  );
}
