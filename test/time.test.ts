import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  daysSince,
  epochTimestamp,
  formatLocalDate,
  formatTimestamp,
  nowMs,
  parseTime,
  remainingMs,
} from "../src/utils/time.js";

describe("time utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T16:30:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats local timestamps without Z suffix", () => {
    expect(formatTimestamp()).toBe("2026-07-04T16:30:00.000");
    expect(formatTimestamp()).not.toContain("Z");
  });

  it("formats local calendar dates", () => {
    expect(formatLocalDate()).toBe("2026-07-04");
  });

  it("uses epoch for missing entry metadata", () => {
    expect(epochTimestamp()).toBe("1970-01-01T08:00:00.000");
  });

  it("counts whole local calendar days", () => {
    expect(daysSince("2026-06-27T23:59:59.000")).toBe(7);
    expect(daysSince("2026-07-04T00:00:01.000")).toBe(0);
  });

  it("parses invalid input as epoch", () => {
    expect(parseTime("not-a-date").valueOf()).toBe(0);
  });

  it("tracks remaining ms against nowMs", () => {
    const deadline = nowMs() + 250;
    expect(remainingMs(deadline)).toBe(250);
    vi.advanceTimersByTime(100);
    expect(remainingMs(deadline)).toBe(150);
  });
});
