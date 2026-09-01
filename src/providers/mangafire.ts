import type {
  ProviderAdapter,
  ProviderOutcome,
  ProviderPageMatch,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./types";
import { providerFound, providerNoMatch } from "./types";
import { extractHtmlAnchors } from "./html";
import { canonicalHttpsUrl, dedupeStrings, getPathSegments, parseHttpUrl, slugToTitle } from "./url";

const MANGAFIRE_HOSTNAMES = new Set(["mangafire.to", "www.mangafire.to"]);

export function matchMangaFirePage(value: string): ProviderPageMatch | null {
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || !MANGAFIRE_HOSTNAMES.has(parsedUrl.hostname.toLowerCase())) {
    return null;
  }
  const segments = getPathSegments(parsedUrl);
  const route = segments[0]?.toLowerCase();
  const token = segments[1];
  if (route === "manga" && segments.length === 2 && token) {
    return {
      providerId: "mangafire",
      pageType: "series",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl("mangafire.to", ["manga", token]),
      seriesId: token.includes(".") ? token.slice(token.lastIndexOf(".") + 1) : token,
      chapterId: null,
    };
  }
  if (route === "read" && segments.length >= 4 && token) {
    return {
      providerId: "mangafire",
      pageType: "chapter",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl("mangafire.to", segments),
      seriesId: token.includes(".") ? token.slice(token.lastIndexOf(".") + 1) : token,
      chapterId: segments.slice(2).join("/"),
    };
  }
  return null;
}

export function buildMangaFireSearchRequest(title: string): ProviderSearchRequest {
  const params = new URLSearchParams({ keyword: title.trim() });
  return {
    url: `https://mangafire.to/filter?${params.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "text/html" },
    forbiddenOutcome: "blocked",
  };
}

function cleanMangaFireTitle(value: string): string {
  return value
    .replace(/\s*[|\-]\s*manga(?:fire)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromMangaFireToken(token: string): string {
  const dot = token.lastIndexOf(".");
  return slugToTitle(dot > 0 ? token.slice(0, dot) : token);
}

export function parseMangaFireSearchResponse(body: string): ProviderOutcome<ProviderSearchCandidate[]> {
  if (
    /\/cdn-cgi\/challenge-platform\//i.test(body)
    || /\bcf-chl-[\w-]+/i.test(body)
    || /<title[^>]*>\s*just a moment(?:\.\.\.)?\s*<\/title>/i.test(body)
    || /cf-mitigated\s*[:=]\s*["']?challenge/i.test(body)
  ) {
    return {
      kind: "blocked",
      providerId: "mangafire",
      message: "MangaFire returned an anti-bot challenge",
    };
  }
  const candidates: ProviderSearchCandidate[] = [];
  const seenUrls = new Set<string>();
  for (const anchor of extractHtmlAnchors(body, "https://mangafire.to")) {
    const match = matchMangaFirePage(anchor.href);
    if (!match || match.pageType !== "series" || seenUrls.has(match.canonicalUrl)) {
      continue;
    }
    const token = getPathSegments(new URL(match.canonicalUrl))[1];
    const title = cleanMangaFireTitle(anchor.text) || titleFromMangaFireToken(token);
    if (!title) {
      continue;
    }
    seenUrls.add(match.canonicalUrl);
    candidates.push({
      providerId: "mangafire",
      title,
      aliases: dedupeStrings([title]),
      seriesId: match.seriesId,
      url: match.canonicalUrl,
    });
  }
  return candidates.length > 0 ? providerFound("mangafire", candidates) : providerNoMatch("mangafire");
}

export function buildMangaFireManualSearchUrl(title: string): string {
  return `https://mangafire.to/filter?keyword=${encodeURIComponent(title.trim())}`;
}

export const MANGAFIRE_ADAPTER: ProviderAdapter = {
  id: "mangafire",
  label: "MangaFire",
  availability: "optional",
  enabledByDefault: false,
  hostnames: ["mangafire.to", "www.mangafire.to"],
  homepageUrl: "https://mangafire.to/",
  credentialPolicy: "omit",
  liveTestPolicy: "safe_public",
  matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
    const match = matchMangaFirePage(url);
    return match
      ? providerFound("mangafire", match, { url: match.canonicalUrl })
      : providerNoMatch("mangafire", { url });
  },
  buildSearchRequest: buildMangaFireSearchRequest,
  parseSearchResponse: parseMangaFireSearchResponse,
  buildManualSearchUrl: buildMangaFireManualSearchUrl,
};
