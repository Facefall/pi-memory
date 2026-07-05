/** Unified placeholder for all secret types (no per-type labels like [REDACTED_TOKEN]). */
export const REDACTED_PLACEHOLDER = "[REDACTED]";

/** Bump when rules change; surfaced in RedactTextResult and PI_MEMORY_DEBUG logs. */
export const SECRET_POLICY_VERSION = "4";

/** Alias for debug metrics / future RedactionPolicy extraction. */
export const REDACTION_POLICY_VERSION = SECRET_POLICY_VERSION;
