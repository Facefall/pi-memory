import type { SecretPattern } from "./types.js";

/** Dev / SaaS / cloud platform tokens (non-LLM-specific). */
export const platformPatterns: readonly SecretPattern[] = [
  // github/v2/github.go
  {
    id: "github-token",
    source: "trufflehog/pkg/detectors/github/v2",
    keywords: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"],
    match: /\b((?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,255})\b/g,
  },

  // pinecone/pinecone.go
  {
    id: "pinecone-api-key",
    source: "trufflehog/pkg/detectors/pinecone",
    keywords: ["pcsk_"],
    match: /\b(pcsk_[A-Za-z0-9]{5,6}_[A-Za-z0-9]{63})\b/g,
  },

  // langsmith/langsmith.go
  {
    id: "langsmith-api-key",
    source: "trufflehog/pkg/detectors/langsmith",
    keywords: ["lsv2_pt_", "lsv2_sk_"],
    match: /\b(lsv2_(?:pt|sk)_[a-f0-9]{32}_[a-f0-9]{10})\b/g,
  },

  // aws/access_keys/accesskey.go (access key id only; secret key needs entropy pairing)
  {
    id: "aws-access-key-id",
    source: "trufflehog/pkg/detectors/aws/access_keys",
    keywords: ["AKIA", "ABIA", "ACCA"],
    match: /\b((?:AKIA|ABIA|ACCA)[A-Z0-9]{16})\b/g,
  },

  // slack/slack.go (four token types merged)
  {
    id: "slack-token",
    source: "trufflehog/pkg/detectors/slack",
    keywords: ["xoxb-", "xoxp-", "xoxa-", "xoxr-"],
    match: /xox[bpar]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
  },

  // stripe/stripe.go (live keys only; test keys intentionally excluded)
  {
    id: "stripe-live-key",
    source: "trufflehog/pkg/detectors/stripe",
    keywords: ["k_live"],
    match: /[rs]k_live_[a-zA-Z0-9]{20,247}/g,
  },

  // gitlab/v2/gitlab_v2.go
  {
    id: "gitlab-pat",
    source: "trufflehog/pkg/detectors/gitlab/v2",
    keywords: ["glpat-"],
    match: /\b(glpat-[a-zA-Z0-9\-=_]{20,22})\b/g,
  },

  // npmtokenv2/npmtokenv2.go
  {
    id: "npm-token",
    source: "trufflehog/pkg/detectors/npmtokenv2",
    keywords: ["npm_"],
    match: /(npm_[0-9a-zA-Z]{36})/g,
  },

  // supabasetoken/supabasetoken.go
  {
    id: "supabase-token",
    source: "trufflehog/pkg/detectors/supabasetoken",
    keywords: ["sbp_"],
    match: /\b(sbp_[a-z0-9]{40})\b/g,
  },

  // linearapi/linearapi.go
  {
    id: "linear-api-key",
    source: "trufflehog/pkg/detectors/linearapi",
    keywords: ["lin_api_"],
    match: /\b(lin_api_[0-9A-Za-z]{40})\b/g,
  },

  // sendgrid/sendgrid.go
  {
    id: "sendgrid-api-key",
    source: "trufflehog/pkg/detectors/sendgrid",
    keywords: ["SG."],
    match: /\bSG\.[\w\-]{20,24}\.[\w\-]{39,50}\b/g,
  },

  // postman/postman.go
  {
    id: "postman-api-key",
    source: "trufflehog/pkg/detectors/postman",
    keywords: ["PMAK-"],
    match: /\b(PMAK-[a-zA-Z0-9\-]{59})\b/g,
  },
];
