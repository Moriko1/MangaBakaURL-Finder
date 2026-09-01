import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

function createEvent<TArgs extends unknown[]>() {
  const listeners: Array<Listener<TArgs>> = [];
  return {
    addListener: vi.fn((listener: Listener<TArgs>) => {
      listeners.push(listener);
    }),
    removeListener: vi.fn((listener: Listener<TArgs>) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }),
    dispatch: (...args: TArgs) => {
      for (const listener of [...listeners]) {
        listener(...args);
      }
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

async function flushBackgroundTasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
}

function createBackgroundHarness(options: { canvasContextAvailable?: boolean } = {}) {
  const onInstalled = createEvent<[{ reason: "install" | "update" }]>() ;
  const onStartup = createEvent<[]>();
  const onMessage = createEvent<[unknown]>();
  const onActivated = createEvent<[{ tabId: number }]>();
  const onUpdated = createEvent<[number, { status?: string; url?: string }, { url?: string }]>();
  const onRemoved = createEvent<[number]>();
  const onStorageChanged = createEvent<[Record<string, { newValue?: unknown }>, string]>();
  const onAlarm = createEvent<[{ name?: string }]>();

  const enabledProviders = {
    atsu: true,
    mangadex: true,
    comixto: false,
    mangafire: false,
    weebcentral: false,
    ehentai: false,
    exhentai: false,
  };
  let queryTabs: Array<{ id?: number; url?: string }> = [];
  const currentTabs = new Map<number, { id: number; url?: string }>();

  const storageGet = vi.fn(async (key: string) => {
    if (key === "extension:settings") {
      return { "extension:settings": { enabledProviders: { ...enabledProviders } } };
    }
    return {};
  });
  const tabsQuery = vi.fn(async () => queryTabs);
  const tabsGet = vi.fn(async (tabId: number) => currentTabs.get(tabId) ?? { id: tabId });
  const setIcon = vi.fn(async (_details: unknown): Promise<void> => undefined);
  const setTitle = vi.fn(async (_details: unknown): Promise<void> => undefined);
  const bitmapClose = vi.fn();
  const fetchMock = vi.fn(async (url: string) => ({
    blob: async () => ({ source: url }),
    ok: true,
  }));
  const createImageBitmapMock = vi.fn(async (blob: { source: string }) => ({
    close: bitmapClose,
    source: blob.source,
  }));

  class MockOffscreenCanvas {
    private source = "";

    getContext() {
      if (options.canvasContextAvailable === false) {
        return null;
      }
      return {
        clearRect: vi.fn(),
        drawImage: (bitmap: { source: string }) => {
          this.source = bitmap.source;
        },
        getImageData: () => ({ source: this.source }),
      };
    }
  }

  const chromeMock = {
    action: { setIcon, setTitle },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(async () => undefined),
      onAlarm,
    },
    runtime: {
      getManifest: vi.fn(() => ({ version: "1.6.4", version_name: "1.6.4 (Google)" })),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      onInstalled,
      onMessage,
      onStartup,
    },
    storage: {
      local: {
        get: storageGet,
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
      onChanged: onStorageChanged,
    },
    tabs: {
      create: vi.fn(async () => ({ id: 99 })),
      get: tabsGet,
      onActivated,
      onRemoved,
      onUpdated,
      query: tabsQuery,
      remove: vi.fn(async () => undefined),
    },
  };

  vi.stubGlobal("chrome", chromeMock);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

  return {
    bitmapClose,
    createImageBitmapMock,
    currentTabs,
    enabledProviders,
    events: { onActivated, onInstalled, onMessage, onRemoved, onStartup, onStorageChanged, onUpdated },
    fetchMock,
    setIcon,
    setQueryTabs: (tabs: Array<{ id?: number; url?: string }>) => {
      queryTabs = tabs;
    },
    setTitle,
    storageGet,
    tabsGet,
    tabsQuery,
  };
}

describe("background action lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not sweep tabs on a cold worker wake but retains startup and install sweeps", async () => {
    const harness = createBackgroundHarness();
    await import("../src/background");

    expect(harness.tabsQuery).not.toHaveBeenCalled();

    harness.events.onStartup.dispatch();
    await vi.waitFor(() => expect(harness.tabsQuery).toHaveBeenCalledTimes(1));

    harness.events.onInstalled.dispatch({ reason: "install" });
    await vi.waitFor(() => expect(harness.tabsQuery).toHaveBeenCalledTimes(2));
  });

  it("shares enabled-provider settings until storage invalidates them and deduplicates applied states", async () => {
    const harness = createBackgroundHarness();
    await import("../src/background");

    harness.events.onUpdated.dispatch(1, { url: "https://atsu.moe/manga/example" }, { url: "https://atsu.moe/manga/example" });
    harness.events.onUpdated.dispatch(2, { url: "https://example.com/" }, { url: "https://example.com/" });
    await vi.waitFor(() => expect(harness.setTitle).toHaveBeenCalledTimes(2));
    expect(harness.storageGet).toHaveBeenCalledTimes(1);

    harness.events.onUpdated.dispatch(1, { status: "complete" }, { url: "https://atsu.moe/manga/example" });
    await flushBackgroundTasks();
    expect(harness.setIcon).toHaveBeenCalledTimes(2);
    expect(harness.setTitle).toHaveBeenCalledTimes(2);

    harness.enabledProviders.atsu = false;
    harness.setQueryTabs([
      { id: 1, url: "https://atsu.moe/manga/example" },
      { id: 2, url: "https://example.com/" },
    ]);
    harness.events.onStorageChanged.dispatch({ "extension:settings": { newValue: {} } }, "local");

    await vi.waitFor(() => expect(harness.storageGet).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(harness.setTitle).toHaveBeenCalledTimes(3));
    expect(harness.setTitle).toHaveBeenLastCalledWith({
      tabId: 1,
      title: "MangaBaka URL Finder (inactive on this page)",
    });
  });

  it("re-reads the actual tab URL for action sync messages", async () => {
    const harness = createBackgroundHarness();
    harness.currentTabs.set(9, { id: 9, url: "https://example.com/not-supported" });
    await import("../src/background");

    harness.events.onMessage.dispatch({
      protocolVersion: 1,
      tabId: 9,
      type: "action:sync",
      url: "https://mangabaka.org/manga/377/ONE-PIECE",
    });

    await vi.waitFor(() => expect(harness.setTitle).toHaveBeenCalledTimes(1));
    expect(harness.tabsGet).toHaveBeenCalledWith(9);
    expect(harness.setTitle).toHaveBeenCalledWith({
      tabId: 9,
      title: "MangaBaka URL Finder (inactive on this page)",
    });
  });

  it("serializes writes so a newer tab generation is the final applied state", async () => {
    const harness = createBackgroundHarness();
    const firstIconWrite = createDeferred<void>();
    harness.setIcon.mockImplementationOnce(() => firstIconWrite.promise);
    await import("../src/background");

    harness.events.onUpdated.dispatch(
      5,
      { url: "https://mangabaka.org/manga/377/ONE-PIECE" },
      { url: "https://mangabaka.org/manga/377/ONE-PIECE" },
    );
    await vi.waitFor(() => expect(harness.setIcon).toHaveBeenCalledTimes(1));

    harness.events.onUpdated.dispatch(5, { url: "https://example.com/" }, { url: "https://example.com/" });
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(8));
    firstIconWrite.resolve();

    await vi.waitFor(() => expect(harness.setIcon).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(harness.setTitle).toHaveBeenCalledTimes(1));
    expect(harness.setTitle).toHaveBeenLastCalledWith({
      tabId: 5,
      title: "MangaBaka URL Finder (inactive on this page)",
    });

    const finalIcon = harness.setIcon.mock.calls[harness.setIcon.mock.calls.length - 1]?.[0] as {
      imageData: Record<number, { source: string }>;
    };
    expect(finalIcon.imageData[16].source).toContain("icon-gray-16.png");
  });

  it("closes decoded bitmaps even when icon canvas conversion fails", async () => {
    const harness = createBackgroundHarness({ canvasContextAvailable: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await import("../src/background");

    harness.events.onUpdated.dispatch(3, { url: "https://example.com/" }, { url: "https://example.com/" });

    await vi.waitFor(() => expect(harness.bitmapClose).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
      "Failed to refresh an updated tab action state.",
      expect.any(Error),
    ));
    expect(harness.setIcon).not.toHaveBeenCalled();
  });

  it("contains event-task failures instead of leaking listener rejections", async () => {
    const harness = createBackgroundHarness();
    const failure = new Error("tabs.get permission failure");
    harness.tabsGet.mockRejectedValueOnce(failure);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await import("../src/background");

    harness.events.onActivated.dispatch({ tabId: 21 });

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
      "Failed to refresh the activated tab action state.",
      failure,
    ));
  });
});
