import { describe, expect, it } from "vitest";

import { resolveAgentDirFromEnv, resolveMemoryAgentDir } from "../src/config/agentDir.js";
import { defaultMemoryAgentDir } from "../src/utils/paths.js";

describe("resolveMemoryAgentDir", () => {
  it("prefers PI_MEMORY_AGENT_DIR over default", () => {
    expect(
      resolveMemoryAgentDir({
        env: { PI_MEMORY_AGENT_DIR: "/data/memory" },
      }),
    ).toBe("/data/memory");
  });

  it("expands ~ in PI_MEMORY_AGENT_DIR", () => {
    const resolved = resolveMemoryAgentDir({
      env: { PI_MEMORY_AGENT_DIR: "~/pi-memory-data" },
    });
    expect(resolved).toMatch(/pi-memory-data$/);
    expect(resolved).not.toContain("~");
  });

  it("defaults to ~/.pi/pi-memory-data when env unset", () => {
    expect(resolveMemoryAgentDir({ env: {} })).toBe(defaultMemoryAgentDir());
  });
});

describe("resolveAgentDirFromEnv", () => {
  it("prefers explicit CLI path", () => {
    expect(
      resolveAgentDirFromEnv("/tmp/agent", { PI_MEMORY_AGENT_DIR: "/data/memory" }),
    ).toBe("/tmp/agent");
  });

  it("uses PI_MEMORY_AGENT_DIR when no CLI flag", () => {
    expect(resolveAgentDirFromEnv(undefined, { PI_MEMORY_AGENT_DIR: "/data/agent" })).toBe(
      "/data/agent",
    );
  });

  it("defaults to ~/.pi/pi-memory-data", () => {
    expect(resolveAgentDirFromEnv(undefined, {})).toBe(defaultMemoryAgentDir());
  });
});
