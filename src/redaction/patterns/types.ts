export type SecretMatchSpan = {
  start: number;
  end: number;
};

/**
 * Per-rule detector: RegExp for prefix/block rules; function when proximity pairing is required.
 * Custom matchers return spans without patternId — collectSpans adds the rule id.
 */
export type SecretPatternMatcher =
  | RegExp
  | ((text: string) => readonly SecretMatchSpan[]);

export type SecretPattern = {
  /** Stable id for debug metrics (no secret material). */
  id: string;
  /** TruffleHog detector path, or "pi-memory" for local supplements. */
  source: string;
  /** Optional keyword pre-filter (mirrors TruffleHog Keywords()). */
  keywords?: string[];
  match: SecretPatternMatcher;
};
