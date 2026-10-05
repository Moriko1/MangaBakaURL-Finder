import { isMangaMediaType, MangaMediaType } from "../domain/media";

export const MANGABAKA_ORIGIN = "https://mangabaka.org";

export interface MangaBakaSeriesLocation {
  seriesId: number;
  mediaType: MangaMediaType | null;
  slug: string | null;
  isLegacy: boolean;
}

function parseSeriesId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const seriesId = Number(value);
  return Number.isSafeInteger(seriesId) ? seriesId : null;
}

function parseUrl(input: string | URL): URL | null {
  try {
    return input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    return null;
  }
}

export function parseMangaBakaSeriesUrl(input: string | URL): MangaBakaSeriesLocation | null {
  const url = parseUrl(input);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.hostname !== "mangabaka.org" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    return null;
  }

  const legacyMatch = url.pathname.match(/^\/([1-9]\d*)\/?$/);
  if (legacyMatch) {
    const seriesId = parseSeriesId(legacyMatch[1]);
    return seriesId === null
      ? null
      : { seriesId, mediaType: null, slug: null, isLegacy: true };
  }

  // These tabs retain the series heading and library controls. Editing/report
  // routes deliberately remain outside the lookup and Read Link contract.
  const canonicalMatch = url.pathname.match(/^\/([^/]+)\/([1-9]\d*)(?:\/([^/]+))?(?:\/(?:covers|related|news|collections|works))?\/?$/);
  if (!canonicalMatch || !isMangaMediaType(canonicalMatch[1])) {
    return null;
  }

  const seriesId = parseSeriesId(canonicalMatch[2]);
  if (seriesId === null) {
    return null;
  }

  let slug: string | null = null;
  if (canonicalMatch[3]) {
    try {
      slug = decodeURIComponent(canonicalMatch[3]);
    } catch {
      return null;
    }

    if (!slug.trim()) {
      return null;
    }
  }

  return {
    seriesId,
    mediaType: canonicalMatch[1],
    slug,
    isLegacy: false,
  };
}

export function isMangaBakaSeriesUrl(input: string | URL): boolean {
  return parseMangaBakaSeriesUrl(input) !== null;
}

export function getMangaBakaSeriesRootUrl(input: string | URL): string | null {
  if (!parseMangaBakaSeriesUrl(input)) {
    return null;
  }
  const url = parseUrl(input)!;
  url.pathname = `/${url.pathname.split("/").filter(Boolean).slice(0, 3).join("/")}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

export function isMangaBakaPageUrl(input: string | URL): boolean {
  const url = parseUrl(input);
  return Boolean(
    url
    && url.protocol === "https:"
    && url.hostname === "mangabaka.org"
    && !url.username
    && !url.password
    && (!url.port || url.port === "443"),
  );
}

export function validateCanonicalMangaBakaSeriesUrl(
  input: string | URL,
  expectedSeriesId?: number,
  expectedMediaType?: MangaMediaType,
): MangaBakaSeriesLocation | null {
  const location = parseMangaBakaSeriesUrl(input);
  if (
    !location ||
    location.isLegacy ||
    !location.mediaType ||
    !location.slug ||
    parseUrl(input)!.pathname.split("/").filter(Boolean).length !== 3 ||
    (expectedSeriesId !== undefined && location.seriesId !== expectedSeriesId) ||
    (expectedMediaType !== undefined && location.mediaType !== expectedMediaType)
  ) {
    return null;
  }

  return location;
}
