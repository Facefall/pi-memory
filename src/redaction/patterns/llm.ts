import { distanceBetweenRanges } from "../utils.js";
import type { SecretMatchSpan, SecretPattern } from "./types.js";

/** osv-scalibr/veles/secrets/mistralapikey — 32-char key within 200 chars of Mistral context. */
const MISTRAL_CONTEXT_RE =
  /\bmistral(?:ai)?(?:[_-]?(?:api[_-]?)?key)?\b|api\.mistral\.ai/gi;
const MISTRAL_KEY_RE = /\b([A-Za-z0-9]{32})\b/g;
const MISTRAL_MAX_DISTANCE = 200;

/**
 * Mistral keys are 32-char alphanumeric with no prefix — match only when a Mistral
 * context marker (e.g. mistral_api_key, api.mistral.ai) is within 200 chars.
 */
function matchMistralApiKey(text: string): readonly SecretMatchSpan[] {
  const contexts: Array<{ start: number; end: number }> = [];
  MISTRAL_CONTEXT_RE.lastIndex = 0;
  let contextMatch: RegExpExecArray | null;
  while ((contextMatch = MISTRAL_CONTEXT_RE.exec(text)) !== null) {
    contexts.push({
      start: contextMatch.index,
      end: contextMatch.index + contextMatch[0].length,
    });
  }
  if (contexts.length === 0) {
    return [];
  }

  const spans: SecretMatchSpan[] = [];
  MISTRAL_KEY_RE.lastIndex = 0;
  let keyMatch: RegExpExecArray | null;
  while ((keyMatch = MISTRAL_KEY_RE.exec(text)) !== null) {
    const captured = keyMatch[1]!;
    const start = keyMatch.index;
    const end = start + captured.length;
    const paired = contexts.some(
      (ctx) => distanceBetweenRanges(ctx.start, ctx.end, start, end) <= MISTRAL_MAX_DISTANCE,
    );
    if (paired) {
      spans.push({ start, end });
    }
  }
  return spans;
}

/** LLM / AI inference provider keys. */
export const llmPatterns: readonly SecretPattern[] = [
  // openai/openai.go
  {
    id: "openai-api-key",
    source: "trufflehog/pkg/detectors/openai",
    keywords: ["T3BlbkFJ"],
    match:
      /\b(sk-(?:(?:proj|svcacct|service)-[A-Za-z0-9_-]+|[a-zA-Z0-9]+)T3BlbkFJ[A-Za-z0-9_-]+)\b/g,
  },

  // anthropic/anthropic.go
  {
    id: "anthropic-api-key",
    source: "trufflehog/pkg/detectors/anthropic",
    keywords: ["sk-ant-api03", "sk-ant-admin01", "sk-ant-"],
    match: /\b(sk-ant-(?:admin01|api03)-[\w-]{93}AA)\b/g,
  },

  // groq/groq.go
  {
    id: "groq-api-key",
    source: "trufflehog/pkg/detectors/groq",
    keywords: ["gsk_"],
    match: /\b(gsk_[a-zA-Z0-9]{52})\b/g,
  },

  // Google Gemini / Maps / GCP consumer API keys (AIzaSy…)
  {
    id: "google-api-key",
    source: "pi-memory",
    keywords: ["AIzaSy"],
    match: /\b(AIzaSy[A-Za-z0-9\-_]{33})\b/g,
  },

  // openrouter/openrouter.go
  {
    id: "openrouter-api-key",
    source: "trufflehog/pkg/detectors/openrouter",
    keywords: ["sk-or-v1-"],
    match: /\b(sk-or-v1-[0-9a-f]{64})\b/g,
  },

  // deepseek/deepseek.go (keyword-gated: bare sk- hex is too ambiguous)
  {
    id: "deepseek-api-key",
    source: "trufflehog/pkg/detectors/deepseek",
    keywords: ["deepseek", "DEEPSEEK"],
    match: /\b(sk-[a-f0-9]{32})\b/g,
  },

  // xai/xai.go
  {
    id: "xai-api-key",
    source: "trufflehog/pkg/detectors/xai",
    keywords: ["xai-"],
    match: /\b(xai-[0-9a-zA-Z_]{80})\b/g,
  },

  // huggingface/huggingface.go
  {
    id: "huggingface-token",
    source: "trufflehog/pkg/detectors/huggingface",
    keywords: ["hf_", "api_org_"],
    match: /\b((?:hf_|api_org_)[a-zA-Z0-9]{34})\b/g,
  },

  // replicate/replicate.go
  {
    id: "replicate-token",
    source: "trufflehog/pkg/detectors/replicate",
    keywords: ["r8_", "replicate"],
    match: /\b(r8_[0-9A-Za-z\-_]{37})\b/g,
  },

  // Perplexity (pplx-…)
  {
    id: "perplexity-api-key",
    source: "pi-memory",
    keywords: ["pplx-"],
    match: /\b(pplx-[A-Za-z0-9_\-]{20,})\b/g,
  },

  // Fireworks AI (fw_…)
  {
    id: "fireworks-api-key",
    source: "pi-memory",
    keywords: ["fw_"],
    match: /\b(fw_[A-Za-z0-9_\-]{20,})\b/g,
  },

  // Voyage AI embeddings (pa-…)
  {
    id: "voyage-api-key",
    source: "pi-memory",
    keywords: ["pa-"],
    match: /\b(pa-[A-Za-z0-9_\-]{20,})\b/g,
  },

  // azure_openai/azure_openai.go
  {
    id: "azure-openai-api-key",
    source: "trufflehog/pkg/detectors/azure_openai",
    keywords: [".openai.azure.com"],
    match: /(?:api[_.-]?key|openai[_.-]?key)(?:.|[\n\r]){0,40}?([a-f0-9]{32})\b/gi,
  },

  // gcp/gcp.go — flat service-account JSON block (provider_x509 marker)
  {
    id: "gcp-service-account-json",
    source: "trufflehog/pkg/detectors/gcp",
    keywords: ["provider_x509", "auth_provider_x509_cert_url"],
    match: /\{[^{]+auth_provider_x509_cert_url[^}]+\}/gi,
  },

  // osv-scalibr/veles/secrets/mistralapikey — pairing via match()
  {
    id: "mistral-api-key",
    source: "osv-scalibr/veles/secrets/mistralapikey",
    keywords: ["mistral", "mistralai", "api.mistral.ai"],
    match: matchMistralApiKey,
  },
];
