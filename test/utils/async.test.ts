import { describe, expect, it } from "vitest";

import {
  mergeAbortSignals,
  PREFLIGHT_ABORTED_MESSAGE,
  PREFLIGHT_TIMEOUT_MESSAGE,
  preflightAbortSignal,
  throwIfAborted,
} from "../../src/utils/async.js";

describe("throwIfAborted", () => {
  it("throws when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(PREFLIGHT_ABORTED_MESSAGE);
  });
});

describe("mergeAbortSignals", () => {
  it("throws when budget is non-positive", () => {
    expect(() => mergeAbortSignals(0)).toThrow(PREFLIGHT_TIMEOUT_MESSAGE);
  });

  it("throws when user signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => mergeAbortSignals(100, controller.signal)).toThrow(PREFLIGHT_ABORTED_MESSAGE);
  });

  it("aborts merged signal after timeout", async () => {
    const signal = mergeAbortSignals(30);
    await expect(
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    ).rejects.toThrow("aborted");
  });

  it("preflightAbortSignal is an alias", () => {
    expect(preflightAbortSignal(100).aborted).toBe(false);
  });
});
