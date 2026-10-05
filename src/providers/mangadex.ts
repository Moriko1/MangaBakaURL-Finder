import type {
  ProviderAdapter,
  ProviderOutcome,
  ProviderPageMatch,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./types";
import { providerFound, providerInvalidResponse, providerNoMatch } from "./types";
import { buildMangaDexManualSearchUrl } from "./manual-search";
import { canonicalHttpsUrl, dedupeStrings, getPathSegments, parseHttpUrl } from "./url";

const MANGADEX_HOSTNAMES = new Set(["mangadex.org", "www.mangadex.org"]);
const MANGADEX_API_HOSTNAME = "api.mangadex.org";
const MANGADEX_CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MangaDexLocalizedStrings {
  [language: string]: unknown;
}

interface MangaDexMangaResource {
  id?: unknown;
  attributes?: {
    title?: MangaDexLocalizedStrings;
    altTitles?: MangaDexLocalizedStrings[];
  };
}

interface MangaDexMangaCollection {
  data?: unknown;
}

export interface MangaDexSeriesTitles {
  seriesId: string;
  titles: string[];
}

export interface MangaDexChapterRecord {
  id: string;
  chapter: string | null;
  translatedLanguage: string | null;
  publishAt: string | null;
  externalUrl: string | null;
}

export interface MangaDexChapterFeed {
  chapters: MangaDexChapterRecord[];
  total: number;
}

export interface MangaDexTitleMetadata {
  availableTranslatedLanguages: string[];
}

export type MangaDexChapterAvailability =
  | { state: "available"; latestChapterNumber: string | null }
  | { state: "purged"; latestChapterNumber: null }
  | { state: "no_chapters_tld"; latestChapterNumber: null };

export function matchMangaDexPage(value: string): ProviderPageMatch | null {
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || !MANGADEX_HOSTNAMES.has(parsedUrl.hostname.toLowerCase())) {
    return null;
  }

  const segments = getPathSegments(parsedUrl);
  const route = segments[0]?.toLowerCase();
  const id = segments[1];
  if ((route !== "title" && route !== "chapter") || !id || !UUID_PATTERN.test(id)) {
    return null;
  }

  return {
    providerId: "mangadex",
    pageType: route === "title" ? "series" : "chapter",
    sourceUrl: value,
    canonicalUrl: canonicalHttpsUrl("mangadex.org", [route, id.toLowerCase()]),
    seriesId: route === "title" ? id.toLowerCase() : null,
    chapterId: route === "chapter" ? id.toLowerCase() : null,
  };
}

export function buildMangaDexSearchRequest(title: string, limit = 10): ProviderSearchRequest {
  const searchParams = new URLSearchParams({
    title: title.trim(),
    limit: Math.min(100, Math.max(1, limit)).toString(),
    "order[relevance]": "desc",
  });
  for (const contentRating of MANGADEX_CONTENT_RATINGS) {
    searchParams.append("contentRating[]", contentRating);
  }
  return {
    url: `https://${MANGADEX_API_HOSTNAME}/manga?${searchParams.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

function localizedStrings(value: MangaDexLocalizedStrings | undefined): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).filter((entry): entry is string => typeof entry === "string");
}

function mangaResourceTitles(resource: MangaDexMangaResource): string[] {
  return dedupeStrings([
    ...localizedStrings(resource.attributes?.title),
    ...(Array.isArray(resource.attributes?.altTitles)
      ? resource.attributes.altTitles.flatMap((entry) => localizedStrings(entry))
      : []),
  ]);
}

export function buildMangaDexChapterMetadataRequest(chapterId: string): ProviderSearchRequest {
  return {
    url: `https://${MANGADEX_API_HOSTNAME}/chapter/${encodeURIComponent(chapterId)}?includes[]=manga`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

export function parseMangaDexChapterSeriesResponse(body: string): ProviderOutcome<MangaDexSeriesTitles> {
  let payload: { data?: { relationships?: unknown } };
  try {
    payload = JSON.parse(body) as { data?: { relationships?: unknown } };
  } catch {
    return providerInvalidResponse("mangadex", "MangaDex chapter metadata was not valid JSON");
  }

  if (!Array.isArray(payload.data?.relationships)) {
    return providerInvalidResponse("mangadex", "MangaDex chapter metadata had no relationships collection");
  }

  const mangaRelationship = payload.data.relationships.find((entry) => (
    Boolean(entry)
    && typeof entry === "object"
    && (entry as { type?: unknown }).type === "manga"
  )) as MangaDexMangaResource | undefined;
  const seriesId = typeof mangaRelationship?.id === "string" ? mangaRelationship.id.toLowerCase() : "";
  if (!UUID_PATTERN.test(seriesId)) {
    return providerInvalidResponse("mangadex", "MangaDex chapter metadata had no valid manga relationship");
  }

  return providerFound("mangadex", {
    seriesId,
    titles: mangaResourceTitles(mangaRelationship ?? {}),
  });
}

export function parseMangaDexSeriesTitlesResponse(body: string): ProviderOutcome<MangaDexSeriesTitles> {
  let payload: { data?: unknown };
  try {
    payload = JSON.parse(body) as { data?: unknown };
  } catch {
    return providerInvalidResponse("mangadex", "MangaDex series metadata was not valid JSON");
  }

  if (!payload.data || typeof payload.data !== "object") {
    return providerInvalidResponse("mangadex", "MangaDex series metadata had no data resource");
  }

  const resource = payload.data as MangaDexMangaResource;
  const seriesId = typeof resource.id === "string" ? resource.id.toLowerCase() : "";
  if (!UUID_PATTERN.test(seriesId)) {
    return providerInvalidResponse("mangadex", "MangaDex series metadata had no valid id");
  }

  const titles = mangaResourceTitles(resource);
  return titles.length > 0
    ? providerFound("mangadex", { seriesId, titles })
    : providerInvalidResponse("mangadex", "MangaDex series metadata had no usable titles");
}

export function parseMangaDexSearchResponse(body: string): ProviderOutcome<ProviderSearchCandidate[]> {
  let payload: MangaDexMangaCollection;
  try {
    payload = JSON.parse(body) as MangaDexMangaCollection;
  } catch {
    return providerInvalidResponse("mangadex", "MangaDex search response was not valid JSON");
  }

  if (!Array.isArray(payload.data)) {
    return providerInvalidResponse("mangadex", "MangaDex search response had no data collection");
  }

  const candidates: ProviderSearchCandidate[] = [];
  const seenIds = new Set<string>();
  for (const rawResource of payload.data) {
    const resource = rawResource as MangaDexMangaResource;
    const id = typeof resource?.id === "string" ? resource.id.toLowerCase() : "";
    if (!UUID_PATTERN.test(id) || seenIds.has(id)) {
      continue;
    }

    const titleMap = resource.attributes?.title;
    const aliases = dedupeStrings([
      ...localizedStrings(titleMap),
      ...(Array.isArray(resource.attributes?.altTitles)
        ? resource.attributes.altTitles.flatMap((entry) => localizedStrings(entry))
        : []),
    ]);
    const title =
      (typeof titleMap?.en === "string" && titleMap.en.trim() ? titleMap.en.trim() : null)
      ?? aliases[0];
    if (!title) {
      continue;
    }

    seenIds.add(id);
    candidates.push({
      providerId: "mangadex",
      title,
      aliases,
      seriesId: id,
      url: canonicalHttpsUrl("mangadex.org", ["title", id]),
    });
  }

  return candidates.length > 0 ? providerFound("mangadex", candidates) : providerNoMatch("mangadex");
}

export function buildMangaDexTitleMetadataRequest(mangaId: string): ProviderSearchRequest {
  return {
    url: `https://${MANGADEX_API_HOSTNAME}/manga/${encodeURIComponent(mangaId)}`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

export function parseMangaDexTitleMetadataResponse(body: string): ProviderOutcome<MangaDexTitleMetadata> {
  let payload: { data?: { attributes?: { availableTranslatedLanguages?: unknown } } };
  try {
    payload = JSON.parse(body) as { data?: { attributes?: { availableTranslatedLanguages?: unknown } } };
  } catch {
    return providerInvalidResponse("mangadex", "MangaDex title metadata was not valid JSON");
  }

  const rawLanguages = payload.data?.attributes?.availableTranslatedLanguages;
  if (!Array.isArray(rawLanguages)) {
    return providerInvalidResponse(
      "mangadex",
      "MangaDex title metadata had no availableTranslatedLanguages collection",
    );
  }
  const availableTranslatedLanguages = dedupeStrings(
    rawLanguages.filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.toLowerCase()),
  );
  return providerFound("mangadex", { availableTranslatedLanguages });
}

export function buildMangaDexChapterFeedRequest(
  mangaId: string,
  limit = 100,
): ProviderSearchRequest {
  const searchParams = new URLSearchParams({
    limit: Math.min(500, Math.max(1, limit)).toString(),
    "translatedLanguage[]": "en",
    "order[chapter]": "desc",
    "order[publishAt]": "desc",
  });
  // Omit the tri-state external URL filter to retain hosted and external chapters.
  for (const contentRating of MANGADEX_CONTENT_RATINGS) {
    searchParams.append("contentRating[]", contentRating);
  }
  return {
    url: `https://${MANGADEX_API_HOSTNAME}/manga/${encodeURIComponent(mangaId)}/feed?${searchParams.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

export function parseMangaDexChapterFeedResponse(body: string): ProviderOutcome<MangaDexChapterFeed> {
  let payload: { data?: unknown; total?: unknown };
  try {
    payload = JSON.parse(body) as { data?: unknown; total?: unknown };
  } catch {
    return providerInvalidResponse("mangadex", "MangaDex chapter feed was not valid JSON");
  }

  if (!Array.isArray(payload.data)) {
    return providerInvalidResponse("mangadex", "MangaDex chapter feed had no data collection");
  }

  const chapters: MangaDexChapterRecord[] = [];
  for (const entry of payload.data) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const resource = entry as { id?: unknown; attributes?: Record<string, unknown> };
    const id = typeof resource.id === "string" ? resource.id : "";
    const attributes = resource.attributes;
    if (!id || !attributes) {
      continue;
    }
    const translatedLanguage =
      typeof attributes.translatedLanguage === "string" ? attributes.translatedLanguage : null;
    if (translatedLanguage !== "en") {
      continue;
    }
    chapters.push({
      id,
      chapter: typeof attributes.chapter === "string" && attributes.chapter.trim()
        ? attributes.chapter.trim()
        : null,
      translatedLanguage,
      publishAt: typeof attributes.publishAt === "string" ? attributes.publishAt : null,
      externalUrl: typeof attributes.externalUrl === "string" ? attributes.externalUrl : null,
    });
  }

  const total = typeof payload.total === "number" && Number.isFinite(payload.total)
    ? Math.max(0, payload.total)
    : chapters.length;
  return providerFound("mangadex", { chapters, total });
}

function comparableChapterNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickHighestMangaDexChapterNumber(chapters: readonly MangaDexChapterRecord[]): string | null {
  let highest: { value: string; numeric: number } | null = null;
  for (const chapter of chapters) {
    const numeric = comparableChapterNumber(chapter.chapter);
    if (numeric != null && (highest == null || numeric > highest.numeric)) {
      highest = { value: chapter.chapter as string, numeric };
    }
  }
  return highest?.value ?? null;
}

export function classifyMangaDexChapterAvailability(
  englishFeed: MangaDexChapterFeed,
  metadata: MangaDexTitleMetadata,
): MangaDexChapterAvailability {
  const englishChapters = englishFeed.chapters.filter(
    (chapter) => chapter.translatedLanguage?.toLowerCase() === "en",
  );
  const latestChapterNumber = pickHighestMangaDexChapterNumber(englishChapters);
  // One-shots and named chapters are available even when no numeric label exists.
  if (englishChapters.length > 0) {
    return {
      state: "available",
      latestChapterNumber,
    };
  }

  const metadataHasEnglish = metadata.availableTranslatedLanguages.some(
    (language) => language.toLowerCase() === "en",
  );
  if (!metadataHasEnglish) {
    return { state: "no_chapters_tld", latestChapterNumber: null };
  }
  return { state: "purged", latestChapterNumber: null };
}

export const MANGADEX_ADAPTER: ProviderAdapter = {
  id: "mangadex",
  label: "MangaDex",
  availability: "enabled",
  enabledByDefault: true,
  hostnames: ["mangadex.org", "www.mangadex.org"],
  homepageUrl: "https://mangadex.org/",
  credentialPolicy: "omit",
  liveTestPolicy: "safe_public",
  matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
    const match = matchMangaDexPage(url);
    return match
      ? providerFound("mangadex", match, { url: match.canonicalUrl })
      : providerNoMatch("mangadex", { url });
  },
  buildSearchRequest: buildMangaDexSearchRequest,
  parseSearchResponse: parseMangaDexSearchResponse,
  buildManualSearchUrl: buildMangaDexManualSearchUrl,
};
