import {
  ActivePageReadiness,
  CONTEXT_GET,
  CONTEXT_SNAPSHOT,
  GET_ACTIVE_PAGE_CONTEXT,
  InvalidBridgeRequestResponse,
  isMangaBakaBridgeMessage,
  MANGABAKA_BRIDGE_PROTOCOL_VERSION,
  MangaBakaBridgeResponse,
  MangaBakaSeriesPageContext,
  PAGE_CONTEXT_PORT_NAME,
  PageContextPortResponse,
  parsePageContextPortRequest,
  parseMangaBakaBridgeRequest,
  READ_LINK_RESULT,
  SET_READ_LINK,
  SetReadLinkRequest,
  SetReadLinkResponse,
} from "../domain/active-page";
import {
  readActivePageContextFromDocument,
  sanitizeElementReadyContext,
} from "./context";
import { setMangaBakaReadLink, SetReadLinkResult } from "./read-link";
import { parseMangaBakaSeriesUrl } from "./url";

export const MANGABAKA_EXTENSION_MARKER = "data-mb-extension";
export const CONTENT_BRIDGE_MARKER = "data-mangabaka-url-finder-content-bridge";
export const MANGABAKA_PAGE_READY_EVENT = "mb:page:ready";
export const MANGABAKA_ELEMENT_READY_EVENT = "mb:element:ready";

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: MangaBakaBridgeResponse) => void,
) => boolean | void;

export interface RuntimeMessageEvent {
  addListener(listener: RuntimeMessageListener): void;
  removeListener(listener: RuntimeMessageListener): void;
}

type PortMessageListener = (message: unknown) => void;
type PortDisconnectListener = () => void;

export interface ContentBridgePort {
  name: string;
  postMessage(message: PageContextPortResponse): void;
  onMessage: {
    addListener(listener: PortMessageListener): void;
    removeListener(listener: PortMessageListener): void;
  };
  onDisconnect: {
    addListener(listener: PortDisconnectListener): void;
    removeListener(listener: PortDisconnectListener): void;
  };
}

export interface RuntimeConnectEvent {
  addListener(listener: (port: ContentBridgePort) => void): void;
  removeListener(listener: (port: ContentBridgePort) => void): void;
}

export interface ContentBridgeRuntime {
  onMessage: RuntimeMessageEvent;
  onConnect: RuntimeConnectEvent;
}

export interface MangaBakaContentBridgeOptions {
  document?: Document;
  runtime?: ContentBridgeRuntime;
  now?: () => Date;
  setReadLink?: (documentNode: Document, url: string) => Promise<SetReadLinkResult>;
}

export interface MangaBakaContentBridgeController {
  getContext(): MangaBakaSeriesPageContext | null;
  refreshFromDocument(readiness?: Exclude<ActivePageReadiness, "element-ready">): MangaBakaSeriesPageContext | null;
  dispose(): void;
}

interface CachedReadLinkCommand {
  seriesId: number;
  url: string;
  promise: Promise<SetReadLinkResponse>;
  settled: boolean;
}

const READINESS_RANK: Readonly<Record<ActivePageReadiness, number>> = {
  "dom-ready": 0,
  "element-ready": 1,
  "page-ready": 2,
};

const INSTALL_KEY = Symbol.for("mangabaka-url-finder.content-bridge.v1");

function contextIdentity(context: MangaBakaSeriesPageContext): string {
  return JSON.stringify({
    url: context.url,
    seriesId: context.seriesId,
    mediaType: context.mediaType,
    canonicalUrl: context.canonicalUrl,
    resolvedTitle: context.resolvedTitle,
  });
}

function cloneContext(context: MangaBakaSeriesPageContext | null): MangaBakaSeriesPageContext | null {
  return context ? { ...context } : null;
}

function isDisconnectedPortError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  return /disconnected port|port[^.]*disconnected|receiving end does not exist/i.test(message);
}

function invalidRequestResponse(message: Record<string, unknown> & { type: string }): InvalidBridgeRequestResponse {
  return {
    protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    requestType: message.type === SET_READ_LINK ? SET_READ_LINK : GET_ACTIVE_PAGE_CONTEXT,
    ...(typeof message.requestId === "string" ? { requestId: message.requestId } : {}),
    ok: false,
    error: {
      code: "invalid_request",
      message: "The MangaBaka content bridge request is invalid.",
    },
  };
}

class MangaBakaContentBridge implements MangaBakaContentBridgeController {
  private context: MangaBakaSeriesPageContext | null = null;
  private disposed = false;
  private readonly readLinkCommands = new Map<string, CachedReadLinkCommand>();
  private readonly ports = new Map<ContentBridgePort, { onMessage: PortMessageListener; onDisconnect: PortDisconnectListener }>();
  private readonly documentNode: Document;
  private readonly runtime: ContentBridgeRuntime;
  private readonly now: () => Date;
  private readonly setReadLink: (documentNode: Document, url: string) => Promise<SetReadLinkResult>;

  private readonly onElementReady = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const context = sanitizeElementReadyContext(detail, this.documentNode, this.observedAt());
    if (context) {
      this.updateContext(context);
    }
  };

  private readonly onPageReady = (): void => {
    this.refreshFromDocument("page-ready");
  };

  private readonly onDomReady = (): void => {
    this.refreshFromDocument("dom-ready");
  };

  private readonly onMessage: RuntimeMessageListener = (message, _sender, sendResponse) => {
    if (!isMangaBakaBridgeMessage(message)) {
      return false;
    }

    const request = parseMangaBakaBridgeRequest(message);
    if (!request) {
      sendResponse(invalidRequestResponse(message));
      return false;
    }

    if (request.type === GET_ACTIVE_PAGE_CONTEXT) {
      sendResponse({
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        requestType: GET_ACTIVE_PAGE_CONTEXT,
        ok: true,
        context: this.getContext(),
      });
      return false;
    }

    void this.handleSetReadLink(request).then(sendResponse);
    return true;
  };

  private readonly onConnect = (port: ContentBridgePort): void => {
    if (port.name !== PAGE_CONTEXT_PORT_NAME || this.disposed || this.ports.has(port)) {
      return;
    }

    const onMessage: PortMessageListener = (message) => {
      const request = parsePageContextPortRequest(message);
      if (!request) {
        return;
      }
      if (request.type === CONTEXT_GET) {
        this.postContextSnapshot(port);
        return;
      }

      const bridgeRequest: SetReadLinkRequest = {
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        type: SET_READ_LINK,
        requestId: request.requestId,
        seriesId: request.seriesId,
        url: request.url,
      };
      void this.handleSetReadLink(bridgeRequest).then((result) => {
        const { requestType: _requestType, ...portResult } = result;
        this.postPortMessage(port, { ...portResult, type: READ_LINK_RESULT });
      });
    };
    const onDisconnect: PortDisconnectListener = () => this.disconnectPort(port);
    this.ports.set(port, { onMessage, onDisconnect });
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    this.postContextSnapshot(port);
  };

  constructor(options: MangaBakaContentBridgeOptions) {
    this.documentNode = options.document ?? document;
    this.runtime = options.runtime ?? chrome.runtime;
    this.now = options.now ?? (() => new Date());
    this.setReadLink = options.setReadLink ?? ((documentNode, url) => setMangaBakaReadLink(documentNode, url));

    this.documentNode.documentElement.setAttribute(MANGABAKA_EXTENSION_MARKER, "1");
    this.documentNode.documentElement.setAttribute(CONTENT_BRIDGE_MARKER, "1");
    this.documentNode.addEventListener(MANGABAKA_ELEMENT_READY_EVENT, this.onElementReady);
    this.documentNode.addEventListener(MANGABAKA_PAGE_READY_EVENT, this.onPageReady);
    this.runtime.onMessage.addListener(this.onMessage);
    this.runtime.onConnect.addListener(this.onConnect);

    if (this.documentNode.readyState === "loading") {
      this.documentNode.addEventListener("DOMContentLoaded", this.onDomReady, { once: true });
    } else {
      this.refreshFromDocument("dom-ready");
    }
  }

  getContext(): MangaBakaSeriesPageContext | null {
    return cloneContext(this.context);
  }

  refreshFromDocument(
    readiness: Exclude<ActivePageReadiness, "element-ready"> = "dom-ready",
  ): MangaBakaSeriesPageContext | null {
    if (this.disposed) {
      return null;
    }

    const nextContext = readActivePageContextFromDocument(this.documentNode, readiness, this.observedAt());
    if (nextContext) {
      this.updateContext(nextContext);
    } else if (this.context) {
      this.context = null;
      this.broadcastContextSnapshot();
    }
    return this.getContext();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.documentNode.removeEventListener(MANGABAKA_ELEMENT_READY_EVENT, this.onElementReady);
    this.documentNode.removeEventListener(MANGABAKA_PAGE_READY_EVENT, this.onPageReady);
    this.documentNode.removeEventListener("DOMContentLoaded", this.onDomReady);
    this.runtime.onMessage.removeListener(this.onMessage);
    this.runtime.onConnect.removeListener(this.onConnect);
    for (const port of [...this.ports.keys()]) {
      this.disconnectPort(port);
    }
    this.documentNode.documentElement.removeAttribute(CONTENT_BRIDGE_MARKER);
  }

  private observedAt(): string {
    return this.now().toISOString();
  }

  private updateContext(nextContext: MangaBakaSeriesPageContext): void {
    if (
      this.context &&
      contextIdentity(this.context) === contextIdentity(nextContext) &&
      READINESS_RANK[this.context.readiness] >= READINESS_RANK[nextContext.readiness]
    ) {
      return;
    }
    this.context = nextContext;
    this.broadcastContextSnapshot();
  }

  private async handleSetReadLink(request: SetReadLinkRequest): Promise<SetReadLinkResponse> {
    const existing = this.readLinkCommands.get(request.requestId);
    if (existing) {
      if (existing.url === request.url && existing.seriesId === request.seriesId) {
        return existing.promise;
      }
      return {
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        requestType: SET_READ_LINK,
        requestId: request.requestId,
        seriesId: request.seriesId,
        ok: false,
        error: {
          code: "invalid_request",
          message: "A Read Link request id cannot be reused with a different URL.",
        },
      };
    }

    const command: CachedReadLinkCommand = {
      seriesId: request.seriesId,
      url: request.url,
      settled: false,
      promise: Promise.resolve({
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        requestType: SET_READ_LINK,
        requestId: request.requestId,
        seriesId: request.seriesId,
        ok: false,
        error: { code: "internal_error", message: "Read Link request was not initialized." },
      }),
    };

    command.promise = this.executeSetReadLink(request).finally(() => {
      command.settled = true;
      this.trimReadLinkCommandCache();
    });
    this.readLinkCommands.set(request.requestId, command);
    this.trimReadLinkCommandCache();
    return command.promise;
  }

  private async executeSetReadLink(request: SetReadLinkRequest): Promise<SetReadLinkResponse> {
    const page = parseMangaBakaSeriesUrl(this.documentNode.location.href);
    if (!page || page.seriesId !== request.seriesId) {
      return {
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        requestType: SET_READ_LINK,
        requestId: request.requestId,
        seriesId: request.seriesId,
        ok: false,
        error: {
          code: "series_mismatch",
          message: "The active MangaBaka series no longer matches this Read Link request.",
        },
      };
    }

    try {
      const result = await this.setReadLink(this.documentNode, request.url);
      return result.ok
        ? {
            protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
            requestType: SET_READ_LINK,
            requestId: request.requestId,
            seriesId: request.seriesId,
            ok: true,
            url: result.url,
          }
        : {
            protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
            requestType: SET_READ_LINK,
            requestId: request.requestId,
            seriesId: request.seriesId,
            ok: false,
            error: result.error,
          };
    } catch {
      return {
        protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
        requestType: SET_READ_LINK,
        requestId: request.requestId,
        seriesId: request.seriesId,
        ok: false,
        error: {
          code: "internal_error",
          message: "Unable to update the MangaBaka Read Link.",
        },
      };
    }
  }

  private trimReadLinkCommandCache(): void {
    while (this.readLinkCommands.size > 32) {
      const completed = [...this.readLinkCommands.entries()].find(([, command]) => command.settled);
      if (!completed) {
        return;
      }
      this.readLinkCommands.delete(completed[0]);
    }
  }

  private postContextSnapshot(port: ContentBridgePort): void {
    this.postPortMessage(port, {
      protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
      type: CONTEXT_SNAPSHOT,
      context: this.getContext(),
    });
  }

  private postPortMessage(port: ContentBridgePort, message: PageContextPortResponse): boolean {
    if (!this.ports.has(port)) {
      return false;
    }

    try {
      port.postMessage(message);
      return true;
    } catch (error) {
      if (!isDisconnectedPortError(error)) {
        throw error;
      }
      this.disconnectPort(port);
      return false;
    }
  }

  private broadcastContextSnapshot(): void {
    for (const port of this.ports.keys()) {
      this.postContextSnapshot(port);
    }
  }

  private disconnectPort(port: ContentBridgePort): void {
    const listeners = this.ports.get(port);
    if (!listeners) {
      return;
    }
    port.onMessage.removeListener(listeners.onMessage);
    port.onDisconnect.removeListener(listeners.onDisconnect);
    this.ports.delete(port);
  }
}

export function createMangaBakaContentBridge(
  options: MangaBakaContentBridgeOptions = {},
): MangaBakaContentBridgeController {
  return new MangaBakaContentBridge(options);
}

export function installMangaBakaContentBridge(
  options: MangaBakaContentBridgeOptions = {},
): MangaBakaContentBridgeController {
  const documentNode = options.document ?? document;
  const pageWindow = documentNode.defaultView ?? window;
  const registry = pageWindow as unknown as Record<PropertyKey, unknown>;
  const existing = registry[INSTALL_KEY];
  if (existing) {
    documentNode.documentElement.setAttribute(MANGABAKA_EXTENSION_MARKER, "1");
    return existing as MangaBakaContentBridgeController;
  }

  const installed = createMangaBakaContentBridge({ ...options, document: documentNode });
  const controller: MangaBakaContentBridgeController = {
    getContext: () => installed.getContext(),
    refreshFromDocument: (readiness) => installed.refreshFromDocument(readiness),
    dispose: () => {
      installed.dispose();
      if (registry[INSTALL_KEY] === controller) {
        delete registry[INSTALL_KEY];
      }
    },
  };
  registry[INSTALL_KEY] = controller;
  return controller;
}
