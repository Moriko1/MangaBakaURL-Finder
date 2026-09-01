import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import {
  CONTEXT_SNAPSHOT,
  createContextGetPortMessage,
  createGetActivePageContextRequest,
  createReadLinkSetPortMessage,
  createSetReadLinkRequest,
  MangaBakaBridgeResponse,
  PAGE_CONTEXT_PORT_NAME,
  PageContextPortResponse,
} from "../src/domain/active-page";
import {
  ContentBridgePort,
  CONTENT_BRIDGE_MARKER,
  ContentBridgeRuntime,
  installMangaBakaContentBridge,
  MANGABAKA_ELEMENT_READY_EVENT,
  MANGABAKA_EXTENSION_MARKER,
  RuntimeConnectEvent,
  RuntimeMessageEvent,
} from "../src/mangabaka/content-bridge";

type Listener = Parameters<RuntimeMessageEvent["addListener"]>[0];

class RuntimeStub implements ContentBridgeRuntime {
  readonly listeners = new Set<Listener>();
  readonly connectListeners = new Set<(port: ContentBridgePort) => void>();
  readonly onMessage: RuntimeMessageEvent = {
    addListener: (listener) => this.listeners.add(listener),
    removeListener: (listener) => this.listeners.delete(listener),
  };
  readonly onConnect: RuntimeConnectEvent = {
    addListener: (listener) => this.connectListeners.add(listener),
    removeListener: (listener) => this.connectListeners.delete(listener),
  };

  dispatch(message: unknown): Promise<MangaBakaBridgeResponse> {
    return new Promise((resolve, reject) => {
      const listener = [...this.listeners][0];
      if (!listener) {
        reject(new Error("No bridge listener"));
        return;
      }
      const handled = listener(message, {}, resolve);
      if (handled === false && !message) {
        reject(new Error("Message was not handled"));
      }
    });
  }

  connect(port: ContentBridgePort): void {
    for (const listener of this.connectListeners) listener(port);
  }
}

class PortStub implements ContentBridgePort {
  readonly name = PAGE_CONTEXT_PORT_NAME;
  readonly messages: PageContextPortResponse[] = [];
  readonly messageListeners = new Set<(message: unknown) => void>();
  readonly disconnectListeners = new Set<() => void>();
  postAttempts = 0;
  throwDisconnectedOnPost = false;
  readonly onMessage = {
    addListener: (listener: (message: unknown) => void) => this.messageListeners.add(listener),
    removeListener: (listener: (message: unknown) => void) => this.messageListeners.delete(listener),
  };
  readonly onDisconnect = {
    addListener: (listener: () => void) => this.disconnectListeners.add(listener),
    removeListener: (listener: () => void) => this.disconnectListeners.delete(listener),
  };
  postMessage(message: PageContextPortResponse): void {
    this.postAttempts += 1;
    if (this.throwDisconnectedOnPost) {
      throw new Error("Attempting to use a disconnected port object");
    }
    this.messages.push(message);
  }
  send(message: unknown): void {
    for (const listener of this.messageListeners) listener(message);
  }
  disconnect(): void {
    for (const listener of this.disconnectListeners) listener();
  }
}

function makeDom() {
  return new JSDOM(`
    <!doctype html>
    <main><h1 lang="en">ONE PIECE</h1></main>
    <div id="ratings" data-browser-extension-injection="ratings"></div>
  `, { url: "https://mangabaka.org/manga/377/ONE-PIECE" });
}

describe("MangaBaka content bridge", () => {
  it("sets the official marker, sanitizes events, and installs only once", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const times = [
      new Date("2026-08-30T23:00:00.000Z"),
      new Date("2026-08-30T23:00:01.000Z"),
    ];
    const now = vi.fn(() => times.shift() ?? new Date("2026-08-30T23:00:02.000Z"));
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime, now });
    const duplicate = installMangaBakaContentBridge({ document: dom.window.document, runtime, now });

    expect(duplicate).toBe(bridge);
    expect(runtime.listeners.size).toBe(1);
    expect(dom.window.document.documentElement.getAttribute(MANGABAKA_EXTENSION_MARKER)).toBe("1");
    expect(dom.window.document.documentElement.getAttribute(CONTENT_BRIDGE_MARKER)).toBe("1");

    const event = new dom.window.CustomEvent(MANGABAKA_ELEMENT_READY_EVENT, {
      detail: {
        element_id: "ratings",
        series: {
          id: 377,
          type: "manga",
          canonical_url: "https://mangabaka.org/manga/377/ONE-PIECE",
          titles: ["ignored"],
        },
      },
    });
    dom.window.document.dispatchEvent(event);
    dom.window.document.dispatchEvent(event);

    const response = await runtime.dispatch(createGetActivePageContextRequest());
    expect(response).toMatchObject({
      ok: true,
      context: {
        seriesId: 377,
        resolvedTitle: "ONE PIECE",
        readiness: "element-ready",
        observedAt: "2026-08-30T23:00:00.000Z",
      },
    });

    bridge.dispose();
    expect(runtime.listeners.size).toBe(0);
    expect(dom.window.document.documentElement.hasAttribute(CONTENT_BRIDGE_MARKER)).toBe(false);
    expect(dom.window.document.documentElement.getAttribute(MANGABAKA_EXTENSION_MARKER)).toBe("1");
  });

  it("deduplicates a SET_READ_LINK command by request id", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const setReadLink = vi.fn(async (_document: Document, url: string) => ({ ok: true as const, url }));
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime, setReadLink });
    const request = createSetReadLinkRequest(377, "https://mangadex.org/title/abc", "save:1");

    const [first, second] = await Promise.all([runtime.dispatch(request), runtime.dispatch(request)]);
    expect(setReadLink).toHaveBeenCalledOnce();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, requestId: "save:1" });

    const reused = await runtime.dispatch(createSetReadLinkRequest(377, "https://atsu.moe/manga/other", "save:1"));
    expect(reused).toMatchObject({ ok: false, error: { code: "invalid_request" } });

    const mismatch = await runtime.dispatch(createSetReadLinkRequest(999, "https://atsu.moe/manga/other", "save:2"));
    expect(mismatch).toMatchObject({ ok: false, error: { code: "series_mismatch" } });
    expect(setReadLink).toHaveBeenCalledOnce();
    bridge.dispose();
  });

  it("emits snapshots only through a connected page-context port", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const setReadLink = vi.fn(async (_document: Document, url: string) => ({ ok: true as const, url }));
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime, setReadLink });
    const port = new PortStub();

    runtime.connect(port);
    expect(port.messages[0]).toEqual({ protocolVersion: 1, type: CONTEXT_SNAPSHOT, context: null });

    dom.window.document.dispatchEvent(new dom.window.CustomEvent(MANGABAKA_ELEMENT_READY_EVENT, {
      detail: {
        element_id: "ratings",
        series: {
          id: 377,
          type: "manga",
          canonical_url: "https://mangabaka.org/manga/377/ONE-PIECE",
        },
      },
    }));
    expect(port.messages[port.messages.length - 1]).toMatchObject({ type: CONTEXT_SNAPSHOT, context: { seriesId: 377 } });

    port.send(createReadLinkSetPortMessage(377, "https://mangadex.org/title/abc", "port:1"));
    await vi.waitFor(() => expect(port.messages[port.messages.length - 1]).toMatchObject({ type: "read-link:result", ok: true }));
    expect(setReadLink).toHaveBeenCalledOnce();
    bridge.dispose();
  });

  it("does not post a pending Read Link result after its port disconnects", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const savedUrl = "https://mangadex.org/title/abc";
    let resolveReadLink!: () => void;
    const pendingReadLink = new Promise<{ ok: true; url: string }>((resolve) => {
      resolveReadLink = () => resolve({ ok: true, url: savedUrl });
    });
    const setReadLink = vi.fn(() => pendingReadLink);
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime, setReadLink });
    const port = new PortStub();

    runtime.connect(port);
    port.send(createReadLinkSetPortMessage(377, savedUrl, "port:pending"));
    expect(setReadLink).toHaveBeenCalledOnce();
    port.disconnect();
    resolveReadLink();
    await pendingReadLink;
    await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));

    expect(port.postAttempts).toBe(1);
    expect(port.messages).toHaveLength(1);
    expect(port.messageListeners.size).toBe(0);
    expect(port.disconnectListeners.size).toBe(0);
    bridge.dispose();
  });

  it("detaches a port when posting reports that it disconnected", () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime });
    const port = new PortStub();

    runtime.connect(port);
    port.throwDisconnectedOnPost = true;
    expect(() => port.send(createContextGetPortMessage())).not.toThrow();

    expect(port.postAttempts).toBe(2);
    expect(port.messageListeners.size).toBe(0);
    expect(port.disconnectListeners.size).toBe(0);
    bridge.dispose();
  });

  it("saves through the typed port using MangaBaka's current editor markup", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const trigger = dom.window.document.createElement("button");
    trigger.type = "button";
    trigger.className = "cover-control";
    trigger.setAttribute("aria-label", "Edit library entry");
    trigger.addEventListener("click", () => {
      const sheet = dom.window.document.createElement("div");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("data-dialog-content", "");
      sheet.setAttribute("data-slot", "sheet-content");
      sheet.setAttribute("data-state", "open");
      sheet.innerHTML = `
        <form action="/my/library/377?no_redirect=true">
          <label data-slot="label">Read link</label>
          <input id="form-field-read_link" name="read_link" data-fs-control data-slot="input" />
          <button type="submit" data-slot="button">Update series</button>
        </form>
      `;
      dom.window.document.body.append(sheet);
      const form = sheet.querySelector<HTMLFormElement>("form")!;
      Object.defineProperty(form, "requestSubmit", {
        value: () => {
          dom.window.document.documentElement.setAttribute(
            "data-saved-read-link",
            sheet.querySelector<HTMLInputElement>("input")!.value,
          );
          sheet.remove();
        },
      });
    });
    dom.window.document.body.append(trigger);

    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime });
    const port = new PortStub();
    runtime.connect(port);
    port.send(createReadLinkSetPortMessage(377, "https://mangadex.org/title/abc", "port:modern-editor"));

    await vi.waitFor(() => expect(port.messages[port.messages.length - 1]).toMatchObject({
      type: "read-link:result",
      requestId: "port:modern-editor",
      ok: true,
    }), { timeout: 2_000 });
    expect(dom.window.document.documentElement.getAttribute("data-saved-read-link"))
      .toBe("https://mangadex.org/title/abc");
    bridge.dispose();
  });

  it("refreshes the connected snapshot after SPA navigation", () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const bridge = installMangaBakaContentBridge({ document: dom.window.document, runtime });
    const port = new PortStub();
    runtime.connect(port);

    dom.window.history.pushState({}, "", "/manhwa/588840/Got-Dropped-into-a-Ghost-Story");
    const heading = dom.window.document.querySelector("main h1")!;
    heading.setAttribute("lang", "en");
    heading.textContent = "Got Dropped into a Ghost Story, Still Gotta Work";
    dom.window.document.dispatchEvent(new dom.window.CustomEvent("mb:page:ready"));

    expect(port.messages[port.messages.length - 1]).toMatchObject({
      type: CONTEXT_SNAPSHOT,
      context: {
        seriesId: 588840,
        mediaType: "manhwa",
        resolvedTitle: "Got Dropped into a Ghost Story, Still Gotta Work",
        readiness: "page-ready",
      },
    });
    bridge.dispose();
  });

  it("returns internal_error when Read Link handling fails unexpectedly", async () => {
    const dom = makeDom();
    const runtime = new RuntimeStub();
    const bridge = installMangaBakaContentBridge({
      document: dom.window.document,
      runtime,
      setReadLink: vi.fn(async () => {
        throw new Error("fixture failure");
      }),
    });

    await expect(runtime.dispatch(createSetReadLinkRequest(
      377,
      "https://mangadex.org/title/abc",
      "save:unexpected",
    ))).resolves.toMatchObject({ ok: false, error: { code: "internal_error" } });
    bridge.dispose();
  });
});
