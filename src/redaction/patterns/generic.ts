import type { SecretPattern } from "./types.js";

/** Catch-all transport / env / URL patterns (pi-memory supplements). */
export const genericPatterns: readonly SecretPattern[] = [
  // Authorization headers in pasted curl / memory notes
  {
    id: "bearer-token",
    source: "pi-memory",
    keywords: ["Bearer ", "bearer "],
    match: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
  },

  // .env-style secret assignments
  {
    id: "env-secret-assignment",
    source: "pi-memory",
    keywords: ["API_KEY", "SECRET", "TOKEN", "PASSWORD"],
    match:
      /(?:^|\n)\s*(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)\s*=\s*[^\s#\n]{8,}/gim,
  },

  // user:pass embedded in URL
  {
    id: "basic-auth-url",
    source: "pi-memory",
    keywords: ["://", "@"],
    match: /https?:\/\/[^\s/?#]+:[^\s/?#@]+@[^\s]+/gi,
  },

  // trufflehog/postgres uriPattern + common SQL URL schemes
  {
    id: "db-connection-url",
    source: "trufflehog/pkg/detectors/postgres",
    keywords: ["postgres://", "postgresql://", "mysql://", "mongodb://", "mongodb+srv://"],
    match: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/\S+\b/gi,
  },

  // trufflehog/jdbc keyPat
  {
    id: "jdbc-url",
    source: "trufflehog/pkg/detectors/jdbc",
    keywords: ["jdbc:"],
    match: /jdbc:[\w]{3,10}:[^\s"'<>,{}[\]]{10,511}[^\s"'<>,{}[\]()&]/gi,
  },
];
