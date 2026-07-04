import { describe, expect, it } from "vitest";

import { resolvePreflightBudget } from "../src/config/preflightBudget.js";

describe("resolvePreflightBudget", () => {
  it("defaults to 800ms total with intent/sidecar split", () => {
    expect(resolvePreflightBudget()).toEqual({
      totalMs: 800,
      intentMs: 240,
      sidecarMs: 560,
    });
  });

  it("clamps custom totals and preserves sidecar reserve", () => {
    expect(resolvePreflightBudget(800)).toEqual({
      totalMs: 800,
      intentMs: 240,
      sidecarMs: 560,
    });

    expect(resolvePreflightBudget(100)).toEqual({
      totalMs: 250,
      intentMs: 50,
      sidecarMs: 200,
    });
  });
});
