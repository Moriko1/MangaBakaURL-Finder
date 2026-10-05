import type {
  ProviderAdapter,
  ProviderId,
  ProviderOutcome,
  ProviderPageMatch,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./types";
import { providerFound, providerNoMatch } from "./types";
import { extractHtmlAnchors } from "./html";
import { buildAdultManualSearchUrl } from "./manual-search";
import { canonicalHttpsUrl, dedupeStrings, getPathSegments, parseHttpUrl } from "./url";

type AdultProviderId = Extract<ProviderId, "ehentai" | "exhentai">;

const ADULT_PROVIDER_CONFIG = {
  ehentai: { hostname: "e-hentai.org", label: "E-Hentai" },
  exhentai: { hostname: "exhentai.org", label: "ExHentai" },
} as const;

function configFor(providerId: AdultProviderId) {
  return ADULT_PROVIDER_CONFIG[providerId];
}

export function matchAdultProviderPage(
  providerId: AdultProviderId,
  value: string,
): ProviderPageMatch | null {
  const config = configFor(providerId);
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || parsedUrl.hostname.toLowerCase() !== config.hostname) {
    return null;
  }
  const segments = getPathSegments(parsedUrl);
  if (segments[0]?.toLowerCase() === "g" && segments.length === 3 && /^\d+$/.test(segments[1])) {
    return {
      providerId,
      pageType: "series",
      sourceUrl: value,
      canonicalUrl: `${canonicalHttpsUrl(config.hostname, ["g", segments[1], segments[2]])}/`,
      seriesId: `${segments[1]}/${segments[2]}`,
      chapterId: null,
    };
  }
  if (segments[0]?.toLowerCase() === "s" && segments.length === 3) {
    const pageMatch = segments[2].match(/^(\d+)-(\d+)$/);
    if (!pageMatch) {
      return null;
    }
    return {
      providerId,
      pageType: "chapter",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl(config.hostname, ["s", segments[1], segments[2]]),
      seriesId: pageMatch[1],
      chapterId: `${segments[1]}/${segments[2]}`,
    };
  }
  return null;
}

export function selectAdultSearchTerms(
  titles: readonly string[],
  startIndex = 0,
  maxTerms = 1,
): string[] {
  const usable = dedupeStrings(titles).slice(Math.max(0, startIndex));
  return usable.slice(0, Math.max(0, maxTerms));
}

export function buildAdultProviderSearchRequest(
  providerId: AdultProviderId,
  title: string,
): ProviderSearchRequest {
  return {
    url: buildAdultManualSearchUrl(providerId, title),
    credentialPolicy: providerId === "exhentai" ? "include" : "omit",
    headers: { accept: "text/html" },
    forbiddenOutcome: providerId === "exhentai" ? "auth_required" : "blocked",
  };
}

function cleanAdultGalleryTitle(value: string): string {
  return value
    .replace(/^(?:\[[^\]]+\]\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAdultProviderSearchResponse(
  providerId: AdultProviderId,
  body: string,
): ProviderOutcome<ProviderSearchCandidate[]> {
  const config = configFor(providerId);
  const candidates: ProviderSearchCandidate[] = [];
  const seenSeriesIds = new Set<string>();
  for (const anchor of extractHtmlAnchors(body, `https://${config.hostname}`)) {
    const match = matchAdultProviderPage(providerId, anchor.href);
    if (!match || match.pageType !== "series" || !match.seriesId || seenSeriesIds.has(match.seriesId)) {
      continue;
    }
    const title = cleanAdultGalleryTitle(anchor.text);
    if (!title) {
      continue;
    }
    seenSeriesIds.add(match.seriesId);
    candidates.push({
      providerId,
      title,
      aliases: dedupeStrings([title, anchor.text]),
      seriesId: match.seriesId,
      url: match.canonicalUrl,
    });
  }
  if (candidates.length > 0) {
    return providerFound(providerId, candidates);
  }
  if (
    providerId === "exhentai"
    && (
      /<form\b[^>]*\baction=["'][^"']*login[^"']*["']/i.test(body)
      || (
        /name=["']UserName["']/i.test(body)
        && /name=["']PassWord["']/i.test(body)
      )
      || /please\s+(?:log|sign)\s+in/i.test(body)
      || /sad\s+panda/i.test(body)
    )
  ) {
    return {
      kind: "auth_required",
      providerId,
      message: "ExHentai authentication is required",
    };
  }
  return providerNoMatch(providerId);
}

function createAdultProviderAdapter(providerId: AdultProviderId): ProviderAdapter {
  const config = configFor(providerId);
  return {
    id: providerId,
    label: config.label,
    availability: "optional",
    enabledByDefault: false,
    hostnames: [config.hostname],
    homepageUrl: `https://${config.hostname}/`,
    credentialPolicy: providerId === "exhentai" ? "include" : "omit",
    liveTestPolicy: "fixture_only",
    matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
      const match = matchAdultProviderPage(providerId, url);
      return match
        ? providerFound(providerId, match, { url: match.canonicalUrl })
        : providerNoMatch(providerId, { url });
    },
    buildSearchRequest: (title) => buildAdultProviderSearchRequest(providerId, title),
    parseSearchResponse: (body) => parseAdultProviderSearchResponse(providerId, body),
    buildManualSearchUrl: (title) => buildAdultManualSearchUrl(providerId, title),
  };
}

export const EHENTAI_ADAPTER = /* @__PURE__ */ createAdultProviderAdapter("ehentai");
export const EXHENTAI_ADAPTER = /* @__PURE__ */ createAdultProviderAdapter("exhentai");
