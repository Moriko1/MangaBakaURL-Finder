import type {
  ProviderAdapter,
  ProviderOutcome,
  ProviderPageMatch,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./types";
import { providerFound, providerNoMatch } from "./types";
import { extractHtmlAnchors } from "./html";
import { buildWeebCentralManualSearchUrl } from "./manual-search";
import { canonicalHttpsUrl, dedupeStrings, getPathSegments, parseHttpUrl, slugToTitle } from "./url";

const WEEBCENTRAL_HOSTNAMES = new Set(["weebcentral.com", "www.weebcentral.com"]);

export function matchWeebCentralPage(value: string): ProviderPageMatch | null {
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || !WEEBCENTRAL_HOSTNAMES.has(parsedUrl.hostname.toLowerCase())) {
    return null;
  }
  const segments = getPathSegments(parsedUrl);
  const route = segments[0]?.toLowerCase();
  if (route === "series" && (segments.length === 2 || segments.length === 3)) {
    return {
      providerId: "weebcentral",
      pageType: "series",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl("weebcentral.com", ["series", segments[1], ...(segments[2] ? [segments[2]] : [])]),
      seriesId: segments[1],
      chapterId: null,
    };
  }
  if (route === "chapters" && segments.length === 2) {
    return {
      providerId: "weebcentral",
      pageType: "chapter",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl("weebcentral.com", ["chapters", segments[1]]),
      seriesId: null,
      chapterId: segments[1],
    };
  }
  return null;
}

export function buildWeebCentralSearchRequest(title: string): ProviderSearchRequest {
  const params = new URLSearchParams({
    text: title.trim(),
    sort: "Best Match",
    order: "Descending",
    official: "Any",
    adult: "False",
    display_mode: "Full Display",
    offset: "0",
  });
  return {
    url: `https://weebcentral.com/search/data?${params.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "text/html" },
  };
}

function cleanWeebCentralTitle(value: string): string {
  return value
    .replace(/^official\s+/i, "")
    .replace(/\s*[|\-]\s*weeb\s*central\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWeebCentralSearchResponse(body: string): ProviderOutcome<ProviderSearchCandidate[]> {
  if (
    /\/cdn-cgi\/challenge-platform\//i.test(body)
    || /\bcf-chl-[\w-]+/i.test(body)
    || /<title[^>]*>\s*just a moment(?:\.\.\.)?\s*<\/title>/i.test(body)
    || /cf-mitigated\s*[:=]\s*["']?challenge/i.test(body)
  ) {
    return {
      kind: "blocked",
      providerId: "weebcentral",
      message: "WeebCentral returned an anti-bot challenge",
    };
  }
  const candidates: ProviderSearchCandidate[] = [];
  const seenIds = new Set<string>();
  for (const anchor of extractHtmlAnchors(body, "https://weebcentral.com")) {
    const match = matchWeebCentralPage(anchor.href);
    if (!match || match.pageType !== "series" || !match.seriesId || seenIds.has(match.seriesId)) {
      continue;
    }
    const segments = getPathSegments(new URL(match.canonicalUrl));
    const title = cleanWeebCentralTitle(anchor.text) || slugToTitle(segments[2] ?? "");
    if (!title) {
      continue;
    }
    seenIds.add(match.seriesId);
    candidates.push({
      providerId: "weebcentral",
      title,
      aliases: dedupeStrings([title]),
      seriesId: match.seriesId,
      url: match.canonicalUrl,
    });
  }
  return candidates.length > 0 ? providerFound("weebcentral", candidates) : providerNoMatch("weebcentral");
}

export const WEEBCENTRAL_ADAPTER: ProviderAdapter = {
  id: "weebcentral",
  label: "WeebCentral",
  availability: "optional",
  enabledByDefault: false,
  hostnames: ["weebcentral.com", "www.weebcentral.com"],
  homepageUrl: "https://weebcentral.com/",
  credentialPolicy: "omit",
  liveTestPolicy: "safe_public",
  matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
    const match = matchWeebCentralPage(url);
    return match
      ? providerFound("weebcentral", match, { url: match.canonicalUrl })
      : providerNoMatch("weebcentral", { url });
  },
  buildSearchRequest: buildWeebCentralSearchRequest,
  parseSearchResponse: parseWeebCentralSearchResponse,
  buildManualSearchUrl: buildWeebCentralManualSearchUrl,
};
