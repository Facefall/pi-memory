import { afterEach, describe, expect, it } from "vitest";

import { readPreflightRuntimeConfig } from "../src/config/preflight.js";
import { ENV_KEYS } from "../src/constants/env.js";

describe("readPreflightRuntimeConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults intent retries to 0 and enables warm/cache", () => {
    delete process.env[ENV_KEYS.INTENT_RETRIES];
    delete process.env[ENV_KEYS.WARM_SIDECAR];
    delete process.env[ENV_KEYS.INTENT_CACHE];

    expect(readPreflightRuntimeConfig()).toEqual({
      intentRetries: 0,
      warmSidecar: true,
      intentCache: true,
    });
  });

  it("parses env overrides", () => {
    process.env[ENV_KEYS.INTENT_RETRIES] = "1";
    process.env[ENV_KEYS.WARM_SIDECAR] = "0";
    process.env[ENV_KEYS.INTENT_CACHE] = "false";

    expect(readPreflightRuntimeConfig()).toEqual({
      intentRetries: 1,
      warmSidecar: false,
      intentCache: false,
    });
  });
});
