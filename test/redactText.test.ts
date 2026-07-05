import { describe, expect, it } from "vitest";

import {
  isEmptyAfterRedaction,
  REDACTED_PLACEHOLDER,
  redactText,
} from "../src/redaction/index.js";
import {
  openAiProjTestKey,
  slackBotTestToken,
} from "./fixtures/redactionSecrets.js";

describe("redactText", () => {
  it("redacts GitHub PAT (TruffleHog github/v2)", () => {
    const token = "ghp_" + "a".repeat(36);
    const { text, hitCount } = redactText(`token is ${token} here`);
    expect(text).toBe(`token is ${REDACTED_PLACEHOLDER} here`);
    expect(hitCount).toBe(1);
  });

  it("redacts OpenAI key (TruffleHog openai)", () => {
    const key = openAiProjTestKey("x".repeat(20));
    const { text } = redactText(`key=${key}`);
    expect(text).toBe(`key=${REDACTED_PLACEHOLDER}`);
  });

  it("redacts Anthropic key (TruffleHog anthropic)", () => {
    const key = "sk-ant-api03-" + "A".repeat(93) + "AA";
    const { text } = redactText(key);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts PEM private key block (TruffleHog privatekey)", () => {
    const pem = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAA
-----END OPENSSH PRIVATE KEY-----`;
    const { text, hitCount } = redactText(`saved key:\n${pem}\nend`);
    expect(text).toBe(`saved key:\n${REDACTED_PLACEHOLDER}\nend`);
    expect(hitCount).toBe(1);
  });

  it("redacts JWT (TruffleHog jwt)", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const { text } = redactText(`auth ${jwt}`);
    expect(text).toBe(`auth ${REDACTED_PLACEHOLDER}`);
  });

  it("redacts Slack bot token (TruffleHog slack)", () => {
    const token = slackBotTestToken();
    const { text } = redactText(token);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts AWS access key id without pairing secret (TruffleHog aws/access_keys)", () => {
    const { text } = redactText("AKIAIOSFODNN7EXAMPLE");
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts Bearer authorization header (pi-memory supplement)", () => {
    const { text } = redactText("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
    expect(text).toContain(REDACTED_PLACEHOLDER);
  });

  it("redacts .env-style secret assignment (pi-memory supplement)", () => {
    const { text } = redactText(`OPENAI_API_KEY=${openAiProjTestKey("z".repeat(20))}`);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts basic auth URL credentials (pi-memory supplement)", () => {
    const { text, hitCount } = redactText("Deploy hook: https://deploy:SuperSecret123@ci.example.com/hooks/run");
    expect(text).toBe("Deploy hook: [REDACTED]");
    expect(hitCount).toBe(1);
  });

  it("redacts postgres connection string (TruffleHog postgres uriPattern)", () => {
    const url = "postgres://app_user:db_pass_123@db.internal:5432/myapp";
    const { text } = redactText(`DATABASE_URL=${url}`);
    expect(text).not.toContain("db_pass_123");
    expect(text).toContain(REDACTED_PLACEHOLDER);
  });

  it("redacts secrets inside JSON fragments", () => {
    const token = "ghp_" + "c".repeat(36);
    const { text } = redactText(`config snippet: {"token":"${token}"}`);
    expect(text).toBe(`config snippet: {"token":"${REDACTED_PLACEHOLDER}"}`);
  });

  it("redacts secrets inside markdown code fences", () => {
    const key = openAiProjTestKey("m".repeat(20));
    const input = "```bash\nexport OPENAI_API_KEY=" + key + "\n```";
    const { text } = redactText(input);
    expect(text).not.toContain(key);
    expect(text).toContain(REDACTED_PLACEHOLDER);
  });

  it("does not redact benign memory text without secrets", () => {
    const note = "User prefers dark mode. Project uses pi-memory for episodic recall.";
    const { text, hitCount, mutated } = redactText(note);
    expect(text).toBe(note);
    expect(hitCount).toBe(0);
    expect(mutated).toBe(false);
  });

  it("redacts Groq API key (TruffleHog groq)", () => {
    const key = "gsk_" + "A".repeat(52);
    const { text } = redactText(`groq key ${key}`);
    expect(text).toBe(`groq key ${REDACTED_PLACEHOLDER}`);
  });

  it("redacts Google AI API key (AIzaSy…)", () => {
    const key = "AIzaSy" + "A".repeat(33);
    const { text } = redactText(`gemini ${key}`);
    expect(text).toBe(`gemini ${REDACTED_PLACEHOLDER}`);
  });

  it("redacts OpenRouter key (TruffleHog openrouter)", () => {
    const key = "sk-or-v1-" + "a".repeat(64);
    const { text } = redactText(key);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts Hugging Face token (TruffleHog huggingface)", () => {
    const token = "hf_" + "A".repeat(34);
    const { text } = redactText(token);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts Replicate token (TruffleHog replicate)", () => {
    const token = "r8_" + "A".repeat(37);
    const { text } = redactText(token);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("redacts Perplexity API key (pplx-…)", () => {
    const key = "pplx-" + "a".repeat(40);
    const { text } = redactText(key);
    expect(text).toBe(REDACTED_PLACEHOLDER);
  });

  it("does not redact plain https URLs without embedded credentials", () => {
    const note = "Docs live at https://vitest.dev/guide/";
    const { text, hitCount } = redactText(note);
    expect(text).toBe(note);
    expect(hitCount).toBe(0);
  });

  it("is deterministic for the same input", () => {
    const token = "ghp_" + "d".repeat(36);
    const input = `saved ${token}`;
    const first = redactText(input);
    const second = redactText(input);
    expect(second).toEqual(first);
  });

  it("redacts Azure OpenAI 32-hex key when Azure endpoint is present (TruffleHog azure_openai)", () => {
    const key = "a1b2c3d4e5f6789012345678901234ab";
    const input = `endpoint=https://myresource.openai.azure.com/ openai_key=${key}`;
    const { text } = redactText(input);
    expect(text).not.toContain(key);
    expect(text).toContain(REDACTED_PLACEHOLDER);
  });

  it("does not redact bare 32-hex without Azure endpoint context", () => {
    const key = "a1b2c3d4e5f6789012345678901234ab";
    const input = `openai_key=${key}`;
    const { text, hitCount } = redactText(input);
    expect(text).toBe(input);
    expect(hitCount).toBe(0);
  });

  it("redacts Mistral API key when Mistral context is nearby (osv-scalibr mistralapikey)", () => {
    const key = "AbCdEfGhIjKlMnOpQrStUvWxYz123456";
    const input = `Set mistral_api_key to ${key} for chat.`;
    const { text } = redactText(input);
    expect(text).not.toContain(key);
    expect(text).toContain(REDACTED_PLACEHOLDER);
  });

  it("does not redact 32-char alphanumeric without Mistral context", () => {
    const token = "AbCdEfGhIjKlMnOpQrStUvWxYz123456";
    const input = `session id ${token} saved`;
    const { text, hitCount } = redactText(input);
    expect(text).toBe(input);
    expect(hitCount).toBe(0);
  });

  it("redacts GCP service account JSON block (TruffleHog gcp)", () => {
    const json =
      '{"type":"service_account","project_id":"demo","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs"}';
    const { text, hitCount } = redactText(`credentials: ${json}`);
    expect(text).not.toContain("BEGIN PRIVATE KEY");
    expect(text).toBe(`credentials: ${REDACTED_PLACEHOLDER}`);
    expect(hitCount).toBe(1);
  });

  it("merges overlapping spans into one placeholder", () => {
    const token = "ghp_" + "b".repeat(36);
    const { text, hitCount } = redactText(`Bearer ${token}`);
    expect(hitCount).toBe(1);
    expect(text).toBe(`${REDACTED_PLACEHOLDER}`);
  });
});

describe("isEmptyAfterRedaction", () => {
  it("returns true for empty or placeholder-only content", () => {
    expect(isEmptyAfterRedaction("")).toBe(true);
    expect(isEmptyAfterRedaction("  [REDACTED]  ")).toBe(true);
  });

  it("returns false when non-redacted text remains", () => {
    expect(isEmptyAfterRedaction("still visible")).toBe(false);
  });
});
