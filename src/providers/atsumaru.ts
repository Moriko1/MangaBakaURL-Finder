import type {
  ProviderAdapter,
  ProviderOutcome,
  ProviderPageMatch,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./types";
import { providerFound, providerInvalidResponse, providerNoMatch } from "./types";
import { canonicalHttpsUrl, dedupeStrings, getPathSegments, parseHttpUrl } from "./url";

const ATSUMARU_HOSTNAME = "atsu.moe";

interface AtsumaruSearchDocument {
  hidden?: boolean;
  id?: string;
  otherNames?: string[];
  title?: string;
}

interface AtsumaruSearchPayload {
  hits?: Array<{ document?: AtsumaruSearchDocument }>;
}

interface AtsumaruChapter {
  id?: string;
  title?: string | null;
  number?: number | string | null;
  createdAt?: number;
  index?: number;
}

export interface AtsumaruLatestChapter {
  chapterId: string | null;
  label: string;
  number: string | null;
  title: string | null;
}

export function matchAtsumaruPage(value: string): ProviderPageMatch | null {
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || parsedUrl.hostname.toLowerCase() !== ATSUMARU_HOSTNAME) {
    return null;
  }

  const segments = getPathSegments(parsedUrl);
  if (segments.length === 2 && segments[0].toLowerCase() === "manga") {
    return {
      providerId: "atsu",
      pageType: "series",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl(ATSUMARU_HOSTNAME, ["manga", segments[1]]),
      seriesId: segments[1],
      chapterId: null,
    };
  }

  if (segments.length === 3 && segments[0].toLowerCase() === "read") {
    return {
      providerId: "atsu",
      pageType: "chapter",
      sourceUrl: value,
      canonicalUrl: canonicalHttpsUrl(ATSUMARU_HOSTNAME, ["read", segments[1], segments[2]]),
      seriesId: segments[1],
      chapterId: segments[2],
    };
  }

  return null;
}

export function buildAtsumaruSearchRequest(title: string, limit = 20): ProviderSearchRequest {
  const searchParams = new URLSearchParams({
    q: title.trim(),
    query_by: "title,otherNames",
    include_fields: "id,title,otherNames,hidden",
    filter_by: "hidden:=false",
    per_page: Math.min(50, Math.max(1, limit)).toString(),
  });
  return {
    url: `https://${ATSUMARU_HOSTNAME}/collections/manga/documents/search?${searchParams.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

export function parseAtsumaruSearchResponse(body: string): ProviderOutcome<ProviderSearchCandidate[]> {
  let payload: AtsumaruSearchPayload;
  try {
    payload = JSON.parse(body) as AtsumaruSearchPayload;
  } catch {
    return providerInvalidResponse("atsu", "Atsumaru search response was not valid JSON");
  }

  if (!Array.isArray(payload.hits)) {
    return providerInvalidResponse("atsu", "Atsumaru search response had no valid hits collection");
  }

  const candidates: ProviderSearchCandidate[] = [];
  const seenIds = new Set<string>();
  for (const hit of payload.hits ?? []) {
    const document = hit?.document;
    const id = typeof document?.id === "string" ? document.id.trim() : "";
    const title = typeof document?.title === "string" ? document.title.trim() : "";
    if (!id || !title || document?.hidden === true || seenIds.has(id)) {
      continue;
    }

    const aliases = dedupeStrings([
      title,
      ...(Array.isArray(document?.otherNames) ? document.otherNames.filter((entry): entry is string => typeof entry === "string") : []),
    ]);
    seenIds.add(id);
    candidates.push({
      providerId: "atsu",
      title,
      aliases,
      seriesId: id,
      url: canonicalHttpsUrl(ATSUMARU_HOSTNAME, ["manga", id]),
    });
  }

  return candidates.length > 0 ? providerFound("atsu", candidates) : providerNoMatch("atsu");
}

export function buildAtsumaruMangaPageRequest(seriesId: string): ProviderSearchRequest {
  const searchParams = new URLSearchParams({ id: seriesId });
  return {
    url: `https://${ATSUMARU_HOSTNAME}/api/manga/page?${searchParams.toString()}`,
    credentialPolicy: "omit",
    headers: { accept: "application/json" },
  };
}

export function parseAtsumaruEmbeddedTitles(scriptText: string): ProviderOutcome<string[]> {
  const match = scriptText.match(/window\.mangaPage\s*=\s*(\{[\s\S]*?});/);
  if (!match) {
    return providerNoMatch("atsu", { message: "Atsumaru embedded metadata was not present" });
  }

  try {
    const payload = JSON.parse(match[1]) as {
      mangaPage?: { title?: unknown; englishTitle?: unknown; otherNames?: unknown };
    };
    const mangaPage = payload.mangaPage;
    const titles = dedupeStrings([
      typeof mangaPage?.title === "string" ? mangaPage.title : "",
      typeof mangaPage?.englishTitle === "string" ? mangaPage.englishTitle : "",
      ...(Array.isArray(mangaPage?.otherNames)
        ? mangaPage.otherNames.filter((entry): entry is string => typeof entry === "string")
        : []),
    ]);
    return titles.length > 0
      ? providerFound("atsu", titles)
      : providerNoMatch("atsu", { message: "Atsumaru embedded metadata contained no titles" });
  } catch {
    return providerInvalidResponse("atsu", "Atsumaru embedded metadata was not valid JSON");
  }
}

function chapterSortValue(value: AtsumaruChapter["number"]): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : -1;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : -1;
  }

  return -1;
}

function chapterNumber(value: AtsumaruChapter["number"]): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseAtsumaruLatestChapterResponse(body: string): ProviderOutcome<AtsumaruLatestChapter> {
  let payload: { mangaPage?: { chapters?: unknown } };
  try {
    payload = JSON.parse(body) as { mangaPage?: { chapters?: unknown } };
  } catch {
    return providerInvalidResponse("atsu", "Atsumaru manga-page response was not valid JSON");
  }

  const rawChapters = payload.mangaPage?.chapters;
  if (rawChapters != null && !Array.isArray(rawChapters)) {
    return providerInvalidResponse("atsu", "Atsumaru manga-page response had an invalid chapter collection");
  }

  const chapters = (Array.isArray(rawChapters) ? rawChapters : [])
    .filter((entry): entry is AtsumaruChapter => Boolean(entry) && typeof entry === "object")
    .sort((left, right) =>
      chapterSortValue(right.number) - chapterSortValue(left.number)
      || (right.index ?? 0) - (left.index ?? 0)
      || (right.createdAt ?? 0) - (left.createdAt ?? 0));
  const latest = chapters[0];
  if (!latest) {
    return providerNoMatch("atsu", { message: "Atsumaru title contained no chapters" });
  }

  const number = chapterNumber(latest.number);
  const title = typeof latest.title === "string" && latest.title.trim() ? latest.title.trim() : null;
  const label = title && /^page\.\s*/i.test(title) && number ? `Page. ${number}` : number ?? title;
  if (!label) {
    return providerNoMatch("atsu", { message: "Atsumaru latest chapter had no displayable label" });
  }

  return providerFound("atsu", {
    chapterId: typeof latest.id === "string" && latest.id.trim() ? latest.id.trim() : null,
    label,
    number,
    title,
  });
}

export const ATSUMARU_ADAPTER: ProviderAdapter = {
  id: "atsu",
  label: "Atsumaru",
  availability: "enabled",
  enabledByDefault: true,
  hostnames: [ATSUMARU_HOSTNAME],
  homepageUrl: "https://atsu.moe/",
  credentialPolicy: "omit",
  liveTestPolicy: "safe_public",
  matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
    const match = matchAtsumaruPage(url);
    return match ? providerFound("atsu", match, { url: match.canonicalUrl }) : providerNoMatch("atsu", { url });
  },
  buildSearchRequest: buildAtsumaruSearchRequest,
  parseSearchResponse: parseAtsumaruSearchResponse,
};
