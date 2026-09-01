import { MangaMediaType } from "./media";
import type { ProviderId, ProviderPageType } from "../providers/types";

export const MANGABAKA_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const GET_ACTIVE_PAGE_CONTEXT = "mangabaka-url-finder/get-active-page-context" as const;
export const SET_READ_LINK = "mangabaka-url-finder/set-read-link" as const;
export const PAGE_CONTEXT_PORT_NAME = "page-context:v1" as const;
export const CONTEXT_GET = "context:get" as const;
export const CONTEXT_SNAPSHOT = "context:snapshot" as const;
export const READ_LINK_SET = "read-link:set" as const;
export const READ_LINK_RESULT = "read-link:result" as const;

export type ActivePageReadiness = "element-ready" | "page-ready" | "dom-ready";

interface ActivePageContextBase {
  version: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  url: string;
}

/** Sanitized context produced by the MangaBaka-only content bridge. */
export interface MangaBakaSeriesPageContext extends ActivePageContextBase {
  kind: "mangabaka-series";
  seriesId: number;
  /** Null only for a legacy numeric route until the API resolves canonical identity. */
  mediaType: MangaMediaType | null;
  /** Null only for a legacy numeric route until the API resolves canonical identity. */
  canonicalUrl: string | null;
  resolvedTitle: string;
  observedAt: string;
  readiness: ActivePageReadiness;
}

/** Popup-owned context for a supported provider page. */
export interface ProviderPageContext<
  TProviderId extends ProviderId = ProviderId,
  TProviderLabel extends string = string,
> extends ActivePageContextBase {
  kind: "provider-page";
  providerKey: TProviderId;
  providerLabel: TProviderLabel;
  pageType: ProviderPageType | null;
  primaryTitle: string;
  titles: string[];
  sourceUrl: string;
  isSearchable: boolean;
}

export type UnsupportedPageReason = "missing-url" | "unrecognized-url" | "disabled-provider";

/** Popup-owned context for tabs where no lookup flow applies. */
export interface UnsupportedPageContext extends ActivePageContextBase {
  kind: "unsupported";
  reason: UnsupportedPageReason;
}

/**
 * The popup routing contract. The content bridge deliberately exposes only the
 * MangaBakaSeriesPageContext member because it never runs on provider pages.
 */
export type ActivePageContext =
  | MangaBakaSeriesPageContext
  | ProviderPageContext
  | UnsupportedPageContext;

export function createUnsupportedPageContext(
  url: string,
  reason: UnsupportedPageReason = url ? "unrecognized-url" : "missing-url",
): UnsupportedPageContext {
  return {
    version: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    kind: "unsupported",
    url,
    reason,
  };
}

export function isMangaBakaSeriesPageContext(
  context: ActivePageContext,
): context is MangaBakaSeriesPageContext {
  return context.kind === "mangabaka-series";
}

export interface GetActivePageContextRequest {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  type: typeof GET_ACTIVE_PAGE_CONTEXT;
}

export interface SetReadLinkRequest {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  type: typeof SET_READ_LINK;
  requestId: string;
  seriesId: number;
  url: string;
}

export type MangaBakaBridgeRequest = GetActivePageContextRequest | SetReadLinkRequest;

export type MangaBakaBridgeErrorCode =
  | "invalid_request"
  | "unsupported_page"
  | "series_mismatch"
  | "invalid_read_link"
  | "not_in_library"
  | "editor_unavailable"
  | "field_unavailable"
  | "submit_unavailable"
  | "submission_failed"
  | "internal_error";

export interface MangaBakaBridgeError {
  code: MangaBakaBridgeErrorCode;
  message: string;
}

interface BridgeResponseBase {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
}

export type GetActivePageContextResponse = BridgeResponseBase & {
  requestType: typeof GET_ACTIVE_PAGE_CONTEXT;
  ok: true;
  context: MangaBakaSeriesPageContext | null;
};

export type SetReadLinkResponse = BridgeResponseBase & {
  requestType: typeof SET_READ_LINK;
  requestId: string;
  seriesId: number;
} & (
  | { ok: true; url: string }
  | { ok: false; error: MangaBakaBridgeError }
);

export type InvalidBridgeRequestResponse = BridgeResponseBase & {
  requestType: typeof GET_ACTIVE_PAGE_CONTEXT | typeof SET_READ_LINK;
  requestId?: string;
  ok: false;
  error: MangaBakaBridgeError;
};

export type MangaBakaBridgeResponse =
  | GetActivePageContextResponse
  | SetReadLinkResponse
  | InvalidBridgeRequestResponse;

export interface ContextGetPortMessage {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  type: typeof CONTEXT_GET;
}

export interface ReadLinkSetPortMessage {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  type: typeof READ_LINK_SET;
  requestId: string;
  seriesId: number;
  url: string;
}

export type PageContextPortRequest = ContextGetPortMessage | ReadLinkSetPortMessage;

export interface ContextSnapshotPortMessage {
  protocolVersion: typeof MANGABAKA_BRIDGE_PROTOCOL_VERSION;
  type: typeof CONTEXT_SNAPSHOT;
  context: MangaBakaSeriesPageContext | null;
}

export type ReadLinkResultPortMessage = BridgeResponseBase & {
  type: typeof READ_LINK_RESULT;
  requestId: string;
  seriesId: number;
} & (
  | { ok: true; url: string }
  | { ok: false; error: MangaBakaBridgeError }
);

export type PageContextPortResponse = ContextSnapshotPortMessage | ReadLinkResultPortMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isMangaBakaBridgeMessage(value: unknown): value is Record<string, unknown> & { type: string } {
  return isRecord(value) && (value.type === GET_ACTIVE_PAGE_CONTEXT || value.type === SET_READ_LINK);
}

export function parseMangaBakaBridgeRequest(value: unknown): MangaBakaBridgeRequest | null {
  if (!isMangaBakaBridgeMessage(value) || value.protocolVersion !== MANGABAKA_BRIDGE_PROTOCOL_VERSION) {
    return null;
  }

  if (value.type === GET_ACTIVE_PAGE_CONTEXT) {
    return {
      protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
      type: GET_ACTIVE_PAGE_CONTEXT,
    };
  }

  if (
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId) ||
    typeof value.seriesId !== "number" ||
    !Number.isSafeInteger(value.seriesId) ||
    value.seriesId <= 0 ||
    typeof value.url !== "string"
  ) {
    return null;
  }

  return {
    protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    type: SET_READ_LINK,
    requestId: value.requestId,
    seriesId: value.seriesId,
    url: value.url,
  };
}

export function createGetActivePageContextRequest(): GetActivePageContextRequest {
  return {
    protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    type: GET_ACTIVE_PAGE_CONTEXT,
  };
}

export function createSetReadLinkRequest(seriesId: number, url: string, requestId: string): SetReadLinkRequest {
  return {
    protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    type: SET_READ_LINK,
    requestId,
    seriesId,
    url,
  };
}

export function createContextGetPortMessage(): ContextGetPortMessage {
  return { protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION, type: CONTEXT_GET };
}

export function createReadLinkSetPortMessage(
  seriesId: number,
  url: string,
  requestId: string,
): ReadLinkSetPortMessage {
  return {
    protocolVersion: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    type: READ_LINK_SET,
    requestId,
    seriesId,
    url,
  };
}

export function parsePageContextPortRequest(value: unknown): PageContextPortRequest | null {
  if (!isRecord(value) || value.protocolVersion !== MANGABAKA_BRIDGE_PROTOCOL_VERSION) {
    return null;
  }
  if (value.type === CONTEXT_GET) {
    return createContextGetPortMessage();
  }
  if (
    value.type !== READ_LINK_SET ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId) ||
    typeof value.seriesId !== "number" ||
    !Number.isSafeInteger(value.seriesId) ||
    value.seriesId <= 0 ||
    typeof value.url !== "string"
  ) {
    return null;
  }
  return createReadLinkSetPortMessage(value.seriesId, value.url, value.requestId);
}
