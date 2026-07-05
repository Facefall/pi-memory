import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { REDACTED_PLACEHOLDER } from "../src/redaction/index.js";
import { createMemoryStore } from "../src/store/index.js";
import { openAiProjTestKeyVariant } from "./fixtures/redactionSecrets.js";

describe("MemoryStore redaction (path A)", () => {
  let tmpDir: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appendUser redacts vendor tokens before persisting", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const token = "ghp_" + "a".repeat(36);
    await store.appendUser({
      id: "pref-secret",
      section: "Preferences",
      content: `Deploy with token ${token}`,
      timestamp: "2026-07-05T00:00:00.000Z",
    });

    const entries = await store.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).not.toContain(token);
    expect(entries[0]?.content).toContain(REDACTED_PLACEHOLDER);
  });

  it("appendIfAbsent deduplicates on redacted content", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-dedupe-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const first = {
      id: "f-1",
      section: "Findings" as const,
      content: `OpenAI key is ${openAiProjTestKeyVariant("abc", "x".repeat(20))}`,
      timestamp: "2026-07-05T01:00:00.000Z",
    };
    const second = {
      ...first,
      id: "f-2",
      content: `OpenAI key is ${openAiProjTestKeyVariant("other", "y".repeat(20))}`,
    };

    expect(await store.appendIfAbsent(first)).toBe(true);
    expect(await store.appendIfAbsent(second)).toBe(false);
    expect((await store.listEntries()).length).toBe(1);
    expect((await store.listEntries())[0]?.content).toContain(REDACTED_PLACEHOLDER);
  });

  it("skips write when content is only a secret (empty after redaction)", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-skip-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const token = "ghp_" + "b".repeat(36);
    await store.append({
      id: "only-secret",
      section: "Findings",
      content: token,
      timestamp: "2026-07-05T02:00:00.000Z",
    });

    expect(await store.listEntries()).toHaveLength(0);
    expect(await store.isEmpty()).toBe(true);
  });

  it("does not notify sidecar when redaction skips all writes in appendMany", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-notify-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    let syncCount = 0;
    store.onSyncToSidecar(() => {
      syncCount++;
    });

    const token = "ghp_" + "c".repeat(36);
    const written = await store.appendMany([
      {
        id: "s-1",
        section: "Findings",
        content: token,
        timestamp: "2026-07-05T03:00:00.000Z",
      },
    ]);

    expect(written).toBe(0);
    expect(syncCount).toBe(0);
  });
});
