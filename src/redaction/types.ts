/** Byte range of a secret match in the original string (before replacement). */
export type RedactionSpan = {
  start: number;
  end: number;
  /** Rule id(s) that matched; merged spans join ids with "+". */
  patternId: string;
};

export type RedactTextResult = {
  text: string;
  /** Number of merged spans (not raw regex hit count). */
  hitCount: number;
  secretHits: number;
  /** Always 0 — pi-memory Path A covers secrets only, not PII. */
  piiHits: number;
  mutated: boolean;
  spans: RedactionSpan[];
  /** SECRET_POLICY_VERSION at time of scan; for debug / policy drift audits. */
  policyVersion: string;
};
