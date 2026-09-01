import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTEXT_GET,
  READ_LINK_SET,
  type MangaBakaSeriesPageContext,
} from "../src/domain/active-page";
import { PageContextClient } from "../src/popup/page-context-client";

class ListenerEvent<T extends (...args: never[]) => void> {
  readonly listeners = new Set<T>();
  addListener = (listener: T): void => { this.listeners.add(listener); };
  removeListener = (listener: T): void => { this.listeners.delete(listener); };
  emit(...args: Parameters<T>): void {
    for (const listener of this.listeners) listener(...args);
  }
}

class PortFixture {
  readonly onMessage = new ListenerEvent<(message: unknown) => void>();
  readonly onDisconnect = new ListenerEvent<() => void>();
  autoRespond = true;
  disconnectOnRequest = false;
  readLinkResponseDelayMs: number | null = null;

  constructor(private readonly context: MangaBakaSeriesPageContext) {}

  postMessage = (message: unknown): void => {
    if (!message || typeof message !== "object") {
      return;
    }
    const typedMessage = message as { type?: unknown; requestId?: unknown; seriesId?: unknown; url?: unknown };
    if (typedMessage.type === READ_LINK_SET && this.readLinkResponseDelayMs != null) {
      window.setTimeout(() => this.onMessage.emit({
        protocolVersion: 1,
        type: "read-link:result",
        requestId: typedMessage.requestId,
        seriesId: typedMessage.seriesId,
        ok: true,
        url: typedMessage.url,
      }), this.readLinkResponseDelayMs);
      return;
    }
    if (typedMessage.type !== CONTEXT_GET) {
      return;
    }
    if (this.disconnectOnRequest) {
      this.onDisconnect.emit();
      return;
    }
    if (this.autoRespond) {
      this.onMessage.emit({ protocolVersion: 1, type: "context:snapshot", context: this.context });
    }
  };

  disconnect = vi.fn((): void => { this.onDisconnect.emit(); });
}

const originalChrome = globalThis.chrome;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: originalChrome,
    writable: true,
  });
});

function context(seriesId: number): MangaBakaSeriesPageContext {
  return {
    version: 1,
    kind: "mangabaka-series",
    url: `https://mangabaka.org/manga/${seriesId}/fixture`,
    seriesId,
    mediaType: "manga",
    canonicalUrl: `https://mangabaka.org/manga/${seriesId}/fixture`,
    resolvedTitle: `Series ${seriesId}`,
    observedAt: "2026-08-31T00:00:00.000Z",
    readiness: "page-ready",
  };
}

describe("PageContextClient reconnection", () => {
  it("rejects pending work immediately after disconnect and permits a fresh connection", async () => {
    const firstPort = new PortFixture(context(377));
    const secondPort = new PortFixture(context(378));
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort)
      .mockReturnValueOnce(secondPort);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { tabs: { connect }, scripting: { executeScript: vi.fn() } },
      writable: true,
    });

    const first = await PageContextClient.connect(7, false);
    expect(first.getLastContext()).toMatchObject({ seriesId: 377 });
    firstPort.autoRespond = false;
    const pending = first.getContext();
    firstPort.disconnect();
    await expect(pending).rejects.toThrow("disconnected");
    expect(first.isDisconnected()).toBe(true);

    const replacement = await PageContextClient.connect(7, false);
    expect(replacement.getLastContext()).toMatchObject({ seriesId: 378 });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("injects the bridge once when an existing tab has no receiver", async () => {
    const missingPort = new PortFixture(context(377));
    missingPort.disconnectOnRequest = true;
    const injectedPort = new PortFixture(context(377));
    const executeScript = vi.fn(async () => undefined);
    const connect = vi.fn()
      .mockReturnValueOnce(missingPort)
      .mockReturnValueOnce(injectedPort);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { tabs: { connect }, scripting: { executeScript } },
      writable: true,
    });

    const client = await PageContextClient.connect(9);
    expect(client.getLastContext()).toMatchObject({ seriesId: 377 });
    expect(executeScript).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 9 }, files: ["dist/content.js"] });
  });

  it("disconnects and detaches a timed-out handshake before fallback injection", async () => {
    vi.useFakeTimers();
    const timedOutPort = new PortFixture(context(377));
    timedOutPort.autoRespond = false;
    const injectedPort = new PortFixture(context(378));
    const executeScript = vi.fn(async () => {
      expect(timedOutPort.disconnect).toHaveBeenCalledOnce();
      expect(timedOutPort.onMessage.listeners.size).toBe(0);
      expect(timedOutPort.onDisconnect.listeners.size).toBe(0);
    });
    const connect = vi.fn()
      .mockReturnValueOnce(timedOutPort)
      .mockReturnValueOnce(injectedPort);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { tabs: { connect }, scripting: { executeScript } },
      writable: true,
    });

    const connecting = PageContextClient.connect(9);
    await vi.advanceTimersByTimeAsync(1_500);
    const client = await connecting;

    expect(client.getLastContext()).toMatchObject({ seriesId: 378 });
    expect(executeScript).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(2);
    client.disconnect();
  });

  it("rejects a pending Read Link immediately when explicitly disconnected", async () => {
    const port = new PortFixture(context(377));
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { tabs: { connect: vi.fn(() => port) }, scripting: { executeScript: vi.fn() } },
      writable: true,
    });

    const client = await PageContextClient.connect(7, false);
    const pending = client.setReadLink(377, "https://mangadex.org/title/abc");
    client.disconnect();
    client.disconnect();

    await expect(pending).rejects.toThrow("disconnected");
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(port.onMessage.listeners.size).toBe(0);
    expect(port.onDisconnect.listeners.size).toBe(0);
  });

  it("consumes runtime.lastError when the port reports a disconnect", async () => {
    const port = new PortFixture(context(377));
    let lastErrorReads = 0;
    const runtime = {} as typeof chrome.runtime;
    Object.defineProperty(runtime, "lastError", {
      configurable: true,
      get: () => {
        lastErrorReads += 1;
        return { message: "Could not establish connection. Receiving end does not exist." };
      },
    });
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime,
        tabs: { connect: vi.fn(() => port) },
        scripting: { executeScript: vi.fn() },
      },
      writable: true,
    });

    const client = await PageContextClient.connect(7, false);
    port.onDisconnect.emit();

    expect(client.isDisconnected()).toBe(true);
    expect(lastErrorReads).toBe(1);
    expect(port.onMessage.listeners.size).toBe(0);
    expect(port.onDisconnect.listeners.size).toBe(0);
  });

  it("allows a Read Link response to take longer than the context handshake", async () => {
    vi.useFakeTimers();
    const port = new PortFixture(context(377));
    port.readLinkResponseDelayMs = 2_000;
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { tabs: { connect: vi.fn(() => port) }, scripting: { executeScript: vi.fn() } },
      writable: true,
    });

    const client = await PageContextClient.connect(7, false);
    const pending = client.setReadLink(377, "https://mangadex.org/title/abc");
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toMatchObject({
      type: "read-link:result",
      ok: true,
      seriesId: 377,
      url: "https://mangadex.org/title/abc",
    });
  });
});
