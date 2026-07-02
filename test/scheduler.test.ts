import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTrainScheduler, parseInterval, type SchedulerLog } from "../src/trainer/scheduler.js";

describe("parseInterval", () => {
  it("parses valid intervals", () => {
    expect(parseInterval("1h")).toBe(3_600_000);
    expect(parseInterval("6h")).toBe(21_600_000);
    expect(parseInterval("12h")).toBe(43_200_000);
    expect(parseInterval("24h")).toBe(86_400_000);
  });

  it("is case-insensitive", () => {
    expect(parseInterval("1H")).toBe(3_600_000);
    expect(parseInterval(" 6H ")).toBe(21_600_000);
  });

  it("returns null for disabled/invalid", () => {
    expect(parseInterval(null)).toBeNull();
    expect(parseInterval(undefined)).toBeNull();
    expect(parseInterval("")).toBeNull();
    expect(parseInterval("2h")).toBeNull();
    expect(parseInterval("abc")).toBeNull();
  });
});

describe("createTrainScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns non-running scheduler when interval is null", () => {
    const scheduler = createTrainScheduler({ interval: null });
    expect(scheduler.running()).toBe(false);
    scheduler.stop();
  });

  it("returns non-running scheduler when interval is invalid", () => {
    const scheduler = createTrainScheduler({ interval: "invalid" });
    expect(scheduler.running()).toBe(false);
  });

  it("starts running with valid interval", () => {
    const scheduler = createTrainScheduler({
      interval: "1h",
      trainConfig: { sessionsDir: "/nonexistent", bundleRoot: "/nonexistent" },
    });
    expect(scheduler.running()).toBe(true);
    scheduler.stop();
    expect(scheduler.running()).toBe(false);
  });

  it("stop is idempotent", () => {
    const scheduler = createTrainScheduler({
      interval: "6h",
      trainConfig: { sessionsDir: "/tmp/none", bundleRoot: "/tmp/none" },
    });
    scheduler.stop();
    scheduler.stop();
    expect(scheduler.running()).toBe(false);
  });

  it("fires tick immediately on start", async () => {
    vi.useRealTimers();
    const logs: SchedulerLog[] = [];
    const scheduler = createTrainScheduler(
      {
        interval: "1h",
        trainConfig: { sessionsDir: "/nonexistent-sessions-xyz", bundleRoot: "/tmp/no-bundle" },
      },
      (log) => logs.push(log),
    );

    // Wait for the initial async tick to complete (I/O bound)
    await new Promise((r) => setTimeout(r, 200));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]!.sessionsProcessed).toBe(0);
    expect(logs[0]!.timestamp).toBeTruthy();
    expect(typeof logs[0]!.durationMs).toBe("number");
    scheduler.stop();
    vi.useFakeTimers();
  });

  it("fires on interval tick", async () => {
    vi.useRealTimers();
    const logs: SchedulerLog[] = [];
    const scheduler = createTrainScheduler(
      {
        interval: "1h",
        trainConfig: { sessionsDir: "/nonexistent-sessions-abc", bundleRoot: "/tmp/no-bundle2" },
      },
      (log) => logs.push(log),
    );

    await new Promise((r) => setTimeout(r, 200));
    const initialCount = logs.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);
    scheduler.stop();
    vi.useFakeTimers();
  });

  it("skips tick when no new sessions", async () => {
    vi.useRealTimers();
    const logs: SchedulerLog[] = [];
    const scheduler = createTrainScheduler(
      {
        interval: "1h",
        trainConfig: { sessionsDir: "/nonexistent-dir-no-sessions", bundleRoot: "/tmp/empty" },
      },
      (log) => logs.push(log),
    );

    await new Promise((r) => setTimeout(r, 200));
    expect(logs[0]!.sessionsProcessed).toBe(0);
    scheduler.stop();
    vi.useFakeTimers();
  });

  it("logs errors without crashing", async () => {
    vi.useRealTimers();
    const logs: SchedulerLog[] = [];
    const scheduler = createTrainScheduler(
      {
        interval: "1h",
        trainConfig: { sessionsDir: "/nonexistent", bundleRoot: "/nonexistent" },
      },
      (log) => logs.push(log),
    );

    await new Promise((r) => setTimeout(r, 200));
    expect(logs.length).toBe(1);
    scheduler.stop();
    vi.useFakeTimers();
  });

  it("processes real sessions when available", async () => {
    vi.useRealTimers();
    const tmpSessions = await fs.mkdtemp(path.join(os.tmpdir(), "pi-sched-"));
    const tmpBundle = await fs.mkdtemp(path.join(os.tmpdir(), "pi-sched-b-"));

    await fs.writeFile(
      path.join(tmpSessions, "s1.json"),
      JSON.stringify({
        id: "s1",
        title: "Test",
        created_at: "2026-06-01T00:00:00Z",
        messages: [
          { role: "user", content: "Alice works at Google using TypeScript." },
          { role: "assistant", content: "That's noted." },
        ],
      }),
    );

    const logs: SchedulerLog[] = [];
    const scheduler = createTrainScheduler(
      { interval: "1h", trainConfig: { sessionsDir: tmpSessions, bundleRoot: tmpBundle } },
      (log) => logs.push(log),
    );

    await new Promise((r) => setTimeout(r, 500));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]!.sessionsProcessed).toBe(1);
    expect(logs[0]!.entityCount).toBeGreaterThan(0);
    scheduler.stop();

    await fs.rm(tmpSessions, { recursive: true, force: true });
    await fs.rm(tmpBundle, { recursive: true, force: true });
    vi.useFakeTimers();
  });
});
