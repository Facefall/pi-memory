import { errorSubCode, type ResponseEnvelope } from "./types.js";

export type ErrorClass = "ok" | "retryable" | "permanent" | "unavailable";

export const ErrTransport = new Error("memory: transport failure");

export function classifyTransportError(err: unknown): ErrorClass {
  return err == null ? "ok" : "unavailable";
}

/** Maps HTTP status + envelope → error class (Kocoro memory/errclass.go). */
export function classifyHTTP(
  status: number,
  env: ResponseEnvelope | null,
): ErrorClass {
  if (status >= 200 && status < 300) return "ok";
  const sub = env?.error ? errorSubCode(env.error) : "";
  const code = env?.error?.code ?? "";
  switch (status) {
    case 400:
      return "permanent";
    case 401:
    case 403:
      return "permanent";
    case 409:
      return "retryable";
    case 422:
      return "permanent";
    case 503:
      if (code === "not_ready" || sub === "not_ready") return "unavailable";
      return "permanent";
    case 500:
      return "retryable";
    default:
      return "retryable";
  }
}
