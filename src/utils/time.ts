import dayjs, { type ConfigType, type Dayjs } from "dayjs";

export type TimeInput = ConfigType;

/** Current local time. */
export function now(): Dayjs {
  return dayjs();
}

/** Unix epoch ms (deadlines, lock files, external APIs). */
export function nowMs(): number {
  return dayjs().valueOf();
}

/** Parse stored or external input; invalid values fall back to epoch. */
export function parseTime(input: TimeInput): Dayjs {
  const parsed = dayjs(input);
  return parsed.isValid() ? parsed : dayjs(0);
}

/**
 * Local timestamp for MEMORY entries, GC markers, shutdown queue.
 * Format: YYYY-MM-DDTHH:mm:ss.SSS (local wall clock, no Z suffix).
 */
export function formatTimestamp(input?: TimeInput): string {
  const t = input === undefined ? dayjs() : parseTime(input);
  return t.format("YYYY-MM-DDTHH:mm:ss.SSS");
}

/** Local calendar date (e.g. auto-YYYY-MM-DD-*.md). */
export function formatLocalDate(input?: TimeInput): string {
  const t = input === undefined ? dayjs() : parseTime(input);
  return t.format("YYYY-MM-DD");
}

/** Fallback timestamp when entry metadata is missing. */
export function epochTimestamp(): string {
  return formatTimestamp(0);
}

/** Whole calendar days from `from` until `to` (local; default `to` = now). */
export function daysSince(from: TimeInput, to?: TimeInput): number {
  const end = to === undefined ? dayjs() : parseTime(to);
  const start = parseTime(from);
  return end.startOf("day").diff(start.startOf("day"), "day");
}

/** Milliseconds left until `deadlineMs` (default clock: now). */
export function remainingMs(deadlineMs: number, atMs: number = nowMs()): number {
  return Math.max(0, deadlineMs - atMs);
}
