import { randomBytes } from "node:crypto";
import http from "node:http";

import {
  classifyHTTP,
  classifyTransportError,
  ErrTransport,
  type ErrorClass,
} from "../errclass.js";
import type {
  HealthPayload,
  QueryIntent,
  QueryRequest,
  ReloadResponse,
  ResponseEnvelope,
} from "../types.js";

function requestId(): string {
  return `req-${randomBytes(6).toString("hex")}`;
}

export class SidecarClient {
  constructor(
    private readonly socketPath: string,
    private readonly timeoutMs: number,
  ) {}

  async health(signal?: AbortSignal): Promise<HealthPayload> {
    return this.do<HealthPayload>("GET", "/health", undefined, signal);
  }

  async query(
    intent: QueryIntent,
    signal?: AbortSignal,
  ): Promise<{
    env: ResponseEnvelope | null;
    errorClass: ErrorClass;
    transportError?: Error;
  }> {
    const rid = requestId();
    const body: QueryRequest = { intent, request_id: rid };
    try {
      const { status, data } = await this.doRaw<ResponseEnvelope>(
        "POST",
        "/query",
        body,
        signal,
        rid,
      );
      return {
        env: data,
        errorClass: classifyHTTP(status, data),
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes("transport")) {
        return {
          env: null,
          errorClass: classifyTransportError(err),
          transportError: err,
        };
      }
      return {
        env: null,
        errorClass: "unavailable",
        transportError: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async reload(signal?: AbortSignal): Promise<ReloadResponse> {
    return this.do<ReloadResponse>("POST", "/bundle/reload", {}, signal);
  }

  private async do<T>(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
    requestIdHeader?: string,
  ): Promise<T> {
    const { data } = await this.doRaw<T>(
      method,
      path,
      body,
      signal,
      requestIdHeader,
    );
    return data;
  }

  private doRaw<T>(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
    requestIdHeader?: string,
  ): Promise<{ status: number; data: T }> {
    return new Promise((resolve, reject) => {
      const payload = body != null ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          socketPath: this.socketPath,
          path,
          method,
          headers: {
            "X-Request-ID": requestIdHeader ?? requestId(),
            ...(payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (!text) {
              reject(new Error(`${ErrTransport.message}: empty body`));
              return;
            }
            try {
              resolve({
                status: res.statusCode ?? 0,
                data: JSON.parse(text) as T,
              });
            } catch (e) {
              reject(
                new Error(
                  `${ErrTransport.message}: decode: ${e instanceof Error ? e.message : e}`,
                ),
              );
            }
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error(`${ErrTransport.message}: timeout`));
      });
      req.on("error", (err) => {
        reject(new Error(`${ErrTransport.message}: ${err.message}`));
      });

      if (signal) {
        if (signal.aborted) {
          req.destroy(new Error(`${ErrTransport.message}: aborted`));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            req.destroy(new Error(`${ErrTransport.message}: aborted`));
          },
          { once: true },
        );
      }

      if (payload) req.write(payload);
      req.end();
    });
  }
}
