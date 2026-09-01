import {
  ActivePageReadiness,
  MANGABAKA_BRIDGE_PROTOCOL_VERSION,
  MangaBakaSeriesPageContext,
} from "../domain/active-page";
import { isMangaMediaType, MangaMediaType } from "../domain/media";
import { cleanTitleText } from "../domain/titles";
import {
  parseMangaBakaSeriesUrl,
  validateCanonicalMangaBakaSeriesUrl,
} from "./url";

interface ContextIdentity {
  seriesId: number;
  mediaType: MangaMediaType | null;
  canonicalUrl: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function getVisibleMainHeading(documentNode: Document): string | null {
  const heading = documentNode.querySelector("main h1[lang]");
  const HTMLElementConstructor = documentNode.defaultView?.HTMLElement;
  if (
    !HTMLElementConstructor ||
    !(heading instanceof HTMLElementConstructor) ||
    heading.hidden ||
    heading.getAttribute("aria-hidden") === "true"
  ) {
    return null;
  }

  const style = documentNode.defaultView?.getComputedStyle(heading);
  if (style?.display === "none" || style?.visibility === "hidden") {
    return null;
  }

  const title = cleanTitleText(heading.textContent ?? "");
  return title || null;
}

function normalizeCurrentUrl(documentNode: Document): string | null {
  try {
    const url = new URL(documentNode.location.href);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function createContext(
  documentNode: Document,
  identity: ContextIdentity,
  readiness: ActivePageReadiness,
  observedAt: string,
): MangaBakaSeriesPageContext | null {
  const pageLocation = parseMangaBakaSeriesUrl(documentNode.location.href);
  const resolvedTitle = getVisibleMainHeading(documentNode);
  if (
    !pageLocation ||
    !resolvedTitle ||
    pageLocation.seriesId !== identity.seriesId ||
    (
      pageLocation.mediaType !== null
      && identity.mediaType !== null
      && pageLocation.mediaType !== identity.mediaType
    )
  ) {
    return null;
  }

  return {
    version: MANGABAKA_BRIDGE_PROTOCOL_VERSION,
    kind: "mangabaka-series",
    url: documentNode.location.href,
    seriesId: identity.seriesId,
    mediaType: identity.mediaType,
    canonicalUrl: identity.canonicalUrl,
    resolvedTitle,
    observedAt,
    readiness,
  };
}

function parseEventSeriesIdentity(value: unknown): ContextIdentity | null {
  if (!isRecord(value) || !isPositiveSafeInteger(value.id) || !isMangaMediaType(value.type)) {
    return null;
  }
  if (typeof value.canonical_url !== "string") {
    return null;
  }

  const canonical = validateCanonicalMangaBakaSeriesUrl(value.canonical_url, value.id, value.type);
  if (!canonical) {
    return null;
  }

  return {
    seriesId: value.id,
    mediaType: value.type,
    canonicalUrl: value.canonical_url,
  };
}

export function sanitizeElementReadyContext(
  detail: unknown,
  documentNode: Document,
  observedAt: string,
): MangaBakaSeriesPageContext | null {
  if (!isRecord(detail) || typeof detail.element_id !== "string" || !detail.element_id) {
    return null;
  }

  const integrationElement = documentNode.getElementById(detail.element_id);
  if (!integrationElement?.hasAttribute("data-browser-extension-injection")) {
    return null;
  }

  const identity = parseEventSeriesIdentity(detail.series);
  return identity ? createContext(documentNode, identity, "element-ready", observedAt) : null;
}

function getDocumentIdentity(documentNode: Document): ContextIdentity | null {
  const currentUrl = normalizeCurrentUrl(documentNode);
  if (!currentUrl) {
    return null;
  }

  const currentLocation = parseMangaBakaSeriesUrl(currentUrl);
  if (!currentLocation) {
    return null;
  }

  return {
    seriesId: currentLocation.seriesId,
    mediaType: currentLocation.mediaType,
    canonicalUrl: currentLocation.mediaType ? currentUrl : null,
  };
}

export function readActivePageContextFromDocument(
  documentNode: Document,
  readiness: Exclude<ActivePageReadiness, "element-ready">,
  observedAt: string,
): MangaBakaSeriesPageContext | null {
  const identity = getDocumentIdentity(documentNode);
  return identity ? createContext(documentNode, identity, readiness, observedAt) : null;
}
