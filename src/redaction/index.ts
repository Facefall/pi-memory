export {
  REDACTED_PLACEHOLDER,
  REDACTION_POLICY_VERSION,
  SECRET_PATTERNS,
  SECRET_POLICY_VERSION,
  cryptoPatterns,
  genericPatterns,
  llmPatterns,
  platformPatterns,
  type SecretMatchSpan,
  type SecretPattern,
  type SecretPatternMatcher,
} from "./patterns/index.js";
export { isEmptyAfterRedaction, redactText } from "./redactText.js";
export type { RedactTextResult, RedactionSpan } from "./types.js";
export {
  applySpans,
  collectSpans,
  distanceBetweenRanges,
  hasKeyword,
  mergeSpans,
  runPatternMatch,
} from "./utils.js";
