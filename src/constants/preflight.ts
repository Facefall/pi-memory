/** Injected private memory block size cap. */
export const PRIVATE_MEMORY_BODY_BYTE_CAP = 8 * 1024;

export const PRIVATE_MEMORY_TAG = "private_memory";
export const PRIVATE_MEMORY_OPEN = `<${PRIVATE_MEMORY_TAG}>`;
export const PRIVATE_MEMORY_CLOSE = `</${PRIVATE_MEMORY_TAG}>`;

/** Regex gate: skip episodic preflight for short generic prompts. */
export const MEMORY_CUE_RE =
  /(?:\b(recent|recently|last time|continue|previous|remember|recall|before|earlier)\b|之前|上次|继续|记得|回忆|刚才)/i;

export const PREFLIGHT_SKIP_MIN_LENGTH = 12;
export const PREFLIGHT_EXTRACT_MIN_LENGTH = 24;

/** Helper LLM retries after the first attempt (0 = single try). */
export const DEFAULT_INTENT_RETRIES = 0;
export const MAX_INTENT_RETRIES = 3;

/** Sidecar warm start + intent LRU defaults. */
export const DEFAULT_WARM_SIDECAR_ENABLED = true;
export const DEFAULT_INTENT_CACHE_ENABLED = true;
export const INTENT_CACHE_MAX_ENTRIES = 128;
