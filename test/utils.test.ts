import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SCHEDULER_TEMPLATE_FILES } from "../src/constants/index.js";
import {
  buildConsolidateCliArgs,
  defaultAgentDir,
  defaultPiConfigDir,
  expandHomePath,
  getConsolidateSchedulerKind,
  getConsolidateTemplateNames,
  getPlatform,
  isMacOS,
  isUnixLike,
  isWindows,
  mkdirOptions,
  secureDirMode,
  secureFileMode,
} from "../src/utils/index.js";
import { SECURE_DIR_MODE, SECURE_FILE_MODE } from "../src/constants/security.js";

describe("platform", () => {
  it("detects current platform", () => {
    const platform = getPlatform();
    expect(["darwin", "win32", "other"]).toContain(platform);
    expect(isWindows()).toBe(platform === "win32");
    expect(isMacOS()).toBe(platform === "darwin");
    expect(isUnixLike()).toBe(!isWindows());
  });
});

describe("paths", () => {
  it("expands ~ paths", () => {
    expect(expandHomePath("~/agent")).toBe(join(homedir(), "agent"));
    expect(expandHomePath("~")).toBe(homedir());
    expect(expandHomePath("/tmp/agent")).toBe("/tmp/agent");
  });

  it("uses secure modes on Unix only", () => {
    if (isWindows()) {
      expect(secureDirMode()).toBeUndefined();
      expect(secureFileMode()).toBeUndefined();
      expect(mkdirOptions()).toEqual({ recursive: true });
    } else {
      expect(secureDirMode()).toBe(SECURE_DIR_MODE);
      expect(secureFileMode()).toBe(SECURE_FILE_MODE);
      expect(mkdirOptions()).toEqual({ recursive: true, mode: SECURE_DIR_MODE });
    }
  });

  it("defaults pi config under home", () => {
    expect(defaultPiConfigDir()).toMatch(/\.pi$/);
    expect(defaultAgentDir()).toMatch(/\.pi[\\/]agent$/);
  });
});

describe("scheduler", () => {
  it("maps platform to scheduler kind", () => {
    expect(getConsolidateSchedulerKind("darwin")).toBe("launchd");
    expect(getConsolidateSchedulerKind("win32")).toBe("schtasks");
    expect(getConsolidateSchedulerKind("other")).toBe("crontab");
  });

  it("lists platform templates", () => {
    expect(getConsolidateTemplateNames("win32")).toEqual([
      SCHEDULER_TEMPLATE_FILES.windowsCmd,
      SCHEDULER_TEMPLATE_FILES.windowsSchtasks,
    ]);
    expect(getConsolidateTemplateNames("darwin")).toContain(SCHEDULER_TEMPLATE_FILES.launchd);
  });

  it("builds consolidate argv", () => {
    expect(buildConsolidateCliArgs({ cron: true, verbose: true })).toEqual([
      "consolidate",
      "--cron",
      "--verbose",
    ]);
  });
});
