import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../src/store/index.js";

describe("MemoryStore redaction debug logs", () => {
  let tmpDir: string;
  const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    stderrSpy.mockClear();
    vi.stubEnv("PI_MEMORY_DEBUG", "1");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("logs write_redacted without secret material", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-debug-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const token = "ghp_" + "e".repeat(36);
    await store.appendUser({
      id: "dbg-1",
      section: "Preferences",
      content: `GitHub PAT ${token}`,
      timestamp: "2026-07-05T04:00:00.000Z",
    });

    const redactedLine = stderrSpy.mock.calls.find((call) =>
      String(call[0]).includes("write_redacted"),
    );
    expect(redactedLine).toBeDefined();
    const payload = String(redactedLine?.[0]);
    expect(payload).toContain("hitCount");
    expect(payload).not.toContain(token);
  });

  it("logs write_skipped for empty-after-redaction", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-redact-debug-skip-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    await store.append({
      id: "dbg-2",
      section: "Findings",
      content: "ghp_" + "f".repeat(36),
      timestamp: "2026-07-05T05:00:00.000Z",
    });

    const skippedLine = stderrSpy.mock.calls.find((call) =>
      String(call[0]).includes("write_skipped"),
    );
    expect(skippedLine).toBeDefined();
    expect(String(skippedLine?.[0])).toContain("redaction_empty");
  });
});
