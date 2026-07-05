import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("node:net", () => ({
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

import { sidecarRequest } from "../../src/sidecar/client.js";

class MockSocket extends EventEmitter {
  write = vi.fn();
  end = vi.fn();
  destroy = vi.fn();
}

describe("sidecarRequest", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("rejects immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("turn cancelled"));

    await expect(
      sidecarRequest("/tmp/fake.sock", { type: "ping" }, { signal: controller.signal }),
    ).rejects.toThrow("turn cancelled");

    expect(connectMock).not.toHaveBeenCalled();
  });

  it("destroys socket when signal aborts mid-request", async () => {
    const socket = new MockSocket();
    connectMock.mockReturnValue(socket);

    const controller = new AbortController();
    const promise = sidecarRequest("/tmp/fake.sock", { type: "ping" }, {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    socket.emit("connect");
    controller.abort(new Error("turn cancelled"));

    await expect(promise).rejects.toThrow("turn cancelled");
    expect(socket.destroy).toHaveBeenCalled();
  });
});
