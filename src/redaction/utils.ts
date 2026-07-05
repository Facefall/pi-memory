/**
 * Redaction pipeline helpers.
 *
 * Flow: hasKeyword (gate) → runPatternMatch (per rule) → collectSpans → mergeSpans → applySpans
 */

import type { SecretMatchSpan, SecretPattern, SecretPatternMatcher } from "./patterns/types.js";
import type { RedactionSpan } from "./types.js";

/** Gap between two ranges; 0 when overlapping or adjacent. Used by proximity matchers. */
export function distanceBetweenRanges(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  if (aEnd < bStart) {
    return bStart - aEnd;
  }
  if (bEnd < aStart) {
    return aStart - bEnd;
  }
  return 0;
}

/**
 * TruffleHog-style keyword gate: skip expensive regex / pairing when no keyword appears.
 * Empty keywords → always run (used by rules with strong standalone prefixes).
 */
export function hasKeyword(text: string, keywords: readonly string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) {
    return true;
  }
  const lower = text.toLowerCase();
  for (const keyword of keywords) {
    if (text.includes(keyword) || lower.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Execute one rule's `match` field: either a custom fn or a global RegExp scan.
 * Prefers capture group 1 when present so only the secret token is redacted, not surrounding syntax.
 */
export function runPatternMatch(text: string, matcher: SecretPatternMatcher): SecretMatchSpan[] {
  if (typeof matcher === "function") {
    return [...matcher(text)];
  }

  const spans: SecretMatchSpan[] = [];
  matcher.lastIndex = 0;
  let result: RegExpExecArray | null;
  while ((result = matcher.exec(text)) !== null) {
    const captured = result[1] ?? result[0];
    const start =
      result[1] !== undefined ? result.index + result[0].indexOf(result[1]) : result.index;
    const end = start + captured.length;
    if (end > start) {
      spans.push({ start, end });
    }
    // Avoid infinite loop on zero-width matches (e.g. lookahead-only patterns).
    if (result[0].length === 0) {
      matcher.lastIndex += 1;
    }
  }
  return spans;
}

/** Run every pattern that passes keyword gate; attach rule id to each raw span. */
export function collectSpans(text: string, patterns: readonly SecretPattern[]): RedactionSpan[] {
  const spans: RedactionSpan[] = [];

  for (const pattern of patterns) {
    if (!hasKeyword(text, pattern.keywords)) {
      continue;
    }

    for (const span of runPatternMatch(text, pattern.match)) {
      if (span.end > span.start) {
        spans.push({ start: span.start, end: span.end, patternId: pattern.id });
      }
    }
  }

  return spans;
}

/**
 * Collapse overlapping / adjacent hits into one span so we emit a single [REDACTED].
 * Example: `Bearer ghp_xxx` matched by both bearer-token and github-token → one placeholder.
 */
export function mergeSpans(spans: RedactionSpan[]): RedactionSpan[] {
  if (spans.length === 0) {
    return [];
  }

  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: RedactionSpan[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      last.patternId = `${last.patternId}+${current.patternId}`;
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/** Replace matched ranges right-to-left so earlier span indices stay valid while slicing. */
export function applySpans(text: string, spans: RedactionSpan[], placeholder: string): string {
  if (spans.length === 0) {
    return text;
  }

  let result = text;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    result = result.slice(0, span.start) + placeholder + result.slice(span.end);
  }
  return result;
}
