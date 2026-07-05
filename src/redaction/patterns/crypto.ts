import type { SecretPattern } from "./types.js";

/** PEM / JWT — block or structured token rules; listed first for overlap priority. */
export const cryptoPatterns: readonly SecretPattern[] = [
  // privatekey/privatekey.go
  {
    id: "private-key",
    source: "trufflehog/pkg/detectors/privatekey",
    keywords: ["BEGIN", "PRIVATE KEY"],
    match:
      /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]* PRIVATE KEY-----/gi,
  },

  // jwt/jwt.go
  {
    id: "jwt",
    source: "trufflehog/pkg/detectors/jwt",
    keywords: ["eyJ", "ewogIC", "ewoid"],
    match:
      /\b((?:eyJ|ewogIC|ewoid)[A-Za-z0-9_-]{12,}={0,2}\.(?:eyJ|ewo)[A-Za-z0-9_-]{12,}={0,2}\.[A-Za-z0-9_-]{12,})\b/g,
  },
];
