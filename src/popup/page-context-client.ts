import {
  CONTEXT_SNAPSHOT,
  createContextGetPortMessage,
  createReadLinkSetPortMessage,
  MANGABAKA_BRIDGE_PROTOCOL_VERSION,
  PAGE_CONTEXT_PORT_NAME,
  READ_LINK_RESULT,
  type MangaBakaSeriesPageContext,
  type PageContextPortResponse,
  type ReadLinkResultPortMessage,
} from "../domain/active-page";

const CONTEXT_RESPONSE_TIMEOUT_MS = 1_500;
const READ_LINK_RESPONSE_TIMEOUT_MS = 12_000;
const DISCONNECTED_ERROR_MESSAGE = "The MangaBaka page bridge disconnected.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPortResponse(value: unknown): value is PageContextPortResponse {
  return (
    isRecord(value)
    && value.protocolVersion === MANGABAKA_BRIDGE_PROTOCOL_VERSION
    && (value.type === CONTEXT_SNAPSHOT || value.type === READ_LINK_RESULT)
  );
}

function disconnectedError(): Error {
  return new Error(DISCONNECTED_ERROR_MESSAGE);
}

function isDisconnectedPortError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  return /disconnected port|port[^.]*disconnected|receiving end does not exist/i.test(message);
}

function responseTimeout<T>(
  message: string,
  timeoutMilliseconds: number,
): { promise: Promise<T>; cancel: () => void } {
  let timeoutId = 0;
  const promise = new Promise<T>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMilliseconds);
  });
  return { promise, cancel: () => window.clearTimeout(timeoutId) };
}

export class PageContextClient {
  private latestContext: MangaBakaSeriesPageContext | null = null;
  private disconnected = false;
  private readonly contextWaiters = new Set<{
    resolve: (context: MangaBakaSeriesPageContext | null) => void;
    reject: (error: Error) => void;
  }>();
  private readonly readLinkWaiters = new Map<string, {
    resolve: (response: ReadLinkResultPortMessage) => void;
    reject: (error: Error) => void;
  }>();

  private readonly onMessage = (rawMessage: unknown): void => {
    if (!isPortResponse(rawMessage)) {
      return;
    }

    if (rawMessage.type === CONTEXT_SNAPSHOT) {
      this.latestContext = rawMessage.context;
      for (const waiter of this.contextWaiters) waiter.resolve(rawMessage.context);
      this.contextWaiters.clear();
      return;
    }

    const waiter = this.readLinkWaiters.get(rawMessage.requestId);
    if (waiter) {
      this.readLinkWaiters.delete(rawMessage.requestId);
      waiter.resolve(rawMessage);
    }
  };

  private readonly onDisconnect = (): void => {
    void chrome.runtime?.lastError;
    this.markDisconnected();
    this.detachPortListeners();
  };

  private constructor(private readonly port: chrome.runtime.Port) {
    port.onMessage.addListener(this.onMessage);
    port.onDisconnect.addListener(this.onDisconnect);
  }

  static async connect(tabId: number, injectIfMissing = true): Promise<PageContextClient> {
    let client: PageContextClient | null = null;
    try {
      client = new PageContextClient(chrome.tabs.connect(tabId, { name: PAGE_CONTEXT_PORT_NAME }));
      await client.getContext();
      return client;
    } catch (error) {
      client?.disconnect();
      if (!injectIfMissing) {
        throw error;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content.js"],
      });
      return PageContextClient.connect(tabId, false);
    }
  }

  async getContext(): Promise<MangaBakaSeriesPageContext | null> {
    if (this.disconnected) {
      throw disconnectedError();
    }

    const timeout = responseTimeout<MangaBakaSeriesPageContext | null>(
      "The MangaBaka page bridge did not respond.",
      CONTEXT_RESPONSE_TIMEOUT_MS,
    );
    let waiter: {
      resolve: (context: MangaBakaSeriesPageContext | null) => void;
      reject: (error: Error) => void;
    } | null = null;
    const response = new Promise<MangaBakaSeriesPageContext | null>((resolve, reject) => {
      waiter = { resolve, reject };
      this.contextWaiters.add(waiter);
      this.postMessage(createContextGetPortMessage());
    });
    try {
      return await Promise.race([response, timeout.promise]);
    } finally {
      timeout.cancel();
      if (waiter) this.contextWaiters.delete(waiter);
    }
  }

  getLastContext(): MangaBakaSeriesPageContext | null {
    return this.latestContext ? { ...this.latestContext } : null;
  }

  isDisconnected(): boolean {
    return this.disconnected;
  }

  async setReadLink(seriesId: number, url: string): Promise<ReadLinkResultPortMessage> {
    if (this.disconnected) {
      throw disconnectedError();
    }

    const requestId = `popup:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const timeout = responseTimeout<ReadLinkResultPortMessage>(
      "MangaBaka did not confirm the Read Link update.",
      READ_LINK_RESPONSE_TIMEOUT_MS,
    );
    const response = new Promise<ReadLinkResultPortMessage>((resolve, reject) => {
      this.readLinkWaiters.set(requestId, { resolve, reject });
      this.postMessage(createReadLinkSetPortMessage(seriesId, url, requestId));
    });
    try {
      return await Promise.race([response, timeout.promise]);
    } finally {
      timeout.cancel();
      this.readLinkWaiters.delete(requestId);
    }
  }

  disconnect(): void {
    if (!this.markDisconnected()) {
      return;
    }
    this.detachPortListeners();
    try {
      this.port.disconnect();
    } catch (error) {
      if (!isDisconnectedPortError(error)) {
        throw error;
      }
    }
  }

  private postMessage(message: unknown): void {
    if (this.disconnected) {
      throw disconnectedError();
    }

    try {
      this.port.postMessage(message);
    } catch (error) {
      if (!isDisconnectedPortError(error)) {
        throw error;
      }
      this.markDisconnected();
      this.detachPortListeners();
      throw disconnectedError();
    }
  }

  private markDisconnected(): boolean {
    if (this.disconnected) {
      return false;
    }

    this.disconnected = true;
    const error = disconnectedError();
    for (const waiter of this.contextWaiters) waiter.reject(error);
    for (const waiter of this.readLinkWaiters.values()) waiter.reject(error);
    this.contextWaiters.clear();
    this.readLinkWaiters.clear();
    return true;
  }

  private detachPortListeners(): void {
    this.port.onMessage.removeListener(this.onMessage);
    this.port.onDisconnect.removeListener(this.onDisconnect);
  }
}
