import { isMangaMediaType, type MangaMediaType } from "../domain/media";
import { normalizeTitle, resolveSeriesTitles, type SeriesTitle } from "../domain/titles";
import { validateCanonicalMangaBakaSeriesUrl } from "../mangabaka/url";
import type { ProviderId } from "../providers/types";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;

export const LOOKUP_CACHE_SCHEMA_VERSION = 12 as const;
export const LOOKUP_CACHE_SCHEMA_KEY = "extension:lookup-cache-schema";
export const LOOKUP_CACHE_PREFIX = "lookup:v12:";

export interface CachedMangaBakaSeries {
  requestedSeriesId: number;
  id: number;
  canonicalUrl: string;
  mediaType: MangaMediaType;
  apiTitles: SeriesTitle[];
  rankedSearchTitles: string[];
  authors: string[];
  apiLastUpdatedAt: string | null;
  titleFingerprint: string;
}

export interface CachedProviderState<TMatch = unknown, TOutcome = unknown> {
  searched: boolean;
  result: TMatch | null;
  outcome: TOutcome | null;
  rejectedUrls: string[];
  titleCursor: number;
}

export interface LookupCacheV12<TMatch = unknown, TOutcome = unknown> {
  schemaVersion: typeof LOOKUP_CACHE_SCHEMA_VERSION;
  series: CachedMangaBakaSeries;
  providers: Partial<Record<ProviderId, CachedProviderState<TMatch, TOutcome>>>;
  searchedAt: string;
}

export interface LookupStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isSeriesTitle(value: unknown): value is SeriesTitle {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.language === "string"
    && value.language.trim().length > 0
    && typeof value.title === "string"
    && value.title.trim().length > 0
    && Array.isArray(value.traits)
    && value.traits.every((trait) => typeof trait === "string" && trait.trim().length > 0)
    && (value.note === null || typeof value.note === "string")
    && typeof value.isPrimary === "boolean"
  );
}

const PROVIDER_IDS = new Set<ProviderId>([
  "atsu",
  "mangadex",
  "mangafire",
  "weebcentral",
  "comixto",
  ...(__ADULT_PROVIDERS_ENABLED__ ? ["ehentai", "exhentai"] as ProviderId[] : []),
]);

const PROVIDER_HOSTS = {
  atsu: ["atsu.moe"],
  mangadex: ["mangadex.org"],
  mangafire: ["mangafire.to"],
  weebcentral: ["weebcentral.com"],
  comixto: ["comix.to", "www.comix.to"],
  ...(__ADULT_PROVIDERS_ENABLED__
    ? { ehentai: ["e-hentai.org"], exhentai: ["exhentai.org"] }
    : {}),
} as Partial<Record<ProviderId, readonly string[]>>;

const PROVIDER_LABELS = {
  atsu: "Atsumaru",
  mangadex: "MangaDex",
  mangafire: "MangaFire",
  weebcentral: "WeebCentral",
  comixto: "Comix",
  ...(__ADULT_PROVIDERS_ENABLED__
    ? { ehentai: "E-Hentai", exhentai: "ExHentai" }
    : {}),
} as Readonly<Partial<Record<ProviderId, string>>>;

function isProviderUrl(providerId: ProviderId, value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(PROVIDER_HOSTS[providerId]?.includes(url.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

function isProviderMatchRecord(providerId: ProviderId, value: unknown): value is Record<string, unknown> {
  if (
    !isRecord(value)
    || value.provider !== PROVIDER_LABELS[providerId]
    || typeof value.title !== "string"
    || !value.title.trim()
    || !isProviderUrl(providerId, value.url)
    || !(value.latestChapterNumber === null || typeof value.latestChapterNumber === "string")
    || !(value.latestChapterLanguage === null || value.latestChapterLanguage === "en")
  ) {
    return false;
  }

  if (providerId === "mangadex") {
    const chapterStates = new Set([undefined, null, "purged", "no_chapters_tld"]);
    if (
      !chapterStates.has(value.mangaDexChapterState as undefined | null | string)
      || !chapterStates.has(value.manualMangaDexChapterState as undefined | null | string)
      || !(
        value.manualPurgedChapterNumber === undefined
        || value.manualPurgedChapterNumber === null
        || typeof value.manualPurgedChapterNumber === "string"
      )
    ) {
      return false;
    }
  }

  return true;
}

function providerMatchesAreConsistent(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return left.provider === right.provider
    && left.title === right.title
    && left.url === right.url
    && left.latestChapterNumber === right.latestChapterNumber
    && left.latestChapterLanguage === right.latestChapterLanguage
    && left.manualPurgedChapterNumber === right.manualPurgedChapterNumber
    && left.mangaDexChapterState === right.mangaDexChapterState
    && left.manualMangaDexChapterState === right.manualMangaDexChapterState;
}

function isCachedProviderState(
  providerId: string,
  value: unknown,
  rankedTitleCount: number,
): value is CachedProviderState {
  if (!PROVIDER_IDS.has(providerId as ProviderId) || !isRecord(value)) {
    return false;
  }
  if (
    typeof value.searched !== "boolean"
    || !(value.result === null || isRecord(value.result))
    || !Array.isArray(value.rejectedUrls)
    || !value.rejectedUrls.every((url) => isProviderUrl(providerId as ProviderId, url))
    || typeof value.titleCursor !== "number"
    || !Number.isSafeInteger(value.titleCursor)
    || value.titleCursor < 0
    || value.titleCursor >= rankedTitleCount
  ) {
    return false;
  }

  if (value.outcome === null) {
    return value.searched === false
      && value.result === null
      && value.titleCursor === 0
      && value.rejectedUrls.length === 0;
  }
  if (!isRecord(value.outcome) || value.outcome.providerId !== providerId) {
    return false;
  }
  if (value.outcome.kind === "found") {
    if (
      value.searched !== true
      || !isProviderMatchRecord(providerId as ProviderId, value.result)
      || !isProviderMatchRecord(providerId as ProviderId, value.outcome.value)
    ) {
      return false;
    }
    return providerMatchesAreConsistent(value.result, value.outcome.value);
  }
  if (value.outcome.kind === "no_match") {
    return value.searched === true && value.result === null;
  }
  return false;
}

export function getLookupCacheKey(seriesId: number | string): string {
  const normalized = typeof seriesId === "number" ? seriesId.toString() : seriesId.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error("Lookup cache series id must be a positive integer.");
  }
  return `${LOOKUP_CACHE_PREFIX}${normalized}`;
}

export function createTitleFingerprint(titles: readonly SeriesTitle[]): string {
  return JSON.stringify(titles.map((title) => ({
    language: title.language.trim().toLocaleLowerCase("en-US"),
    traits: [...title.traits].map((trait) => trait.trim().toLocaleLowerCase("en-US")).sort(),
    title: normalizeTitle(title.title),
    isPrimary: title.isPrimary,
  })));
}

export function isLookupCacheV12(value: unknown): value is LookupCacheV12 {
  if (!isRecord(value) || value.schemaVersion !== LOOKUP_CACHE_SCHEMA_VERSION || !isRecord(value.series)) {
    return false;
  }

  const series = value.series;
  if (
    !isPositiveSafeInteger(series.requestedSeriesId)
    || !isPositiveSafeInteger(series.id)
    || typeof series.canonicalUrl !== "string"
    || !isMangaMediaType(series.mediaType)
    || !validateCanonicalMangaBakaSeriesUrl(series.canonicalUrl, series.id, series.mediaType)
    || !Array.isArray(series.apiTitles)
    || series.apiTitles.length === 0
    || !series.apiTitles.every(isSeriesTitle)
    || !Array.isArray(series.rankedSearchTitles)
    || series.rankedSearchTitles.length === 0
    || !series.rankedSearchTitles.every((title) => typeof title === "string" && title.trim().length > 0)
    || !Array.isArray(series.authors)
    || !series.authors.every((author) => typeof author === "string" && author.trim().length > 0)
    || (series.apiLastUpdatedAt !== null && !isIsoTimestamp(series.apiLastUpdatedAt))
    || typeof series.titleFingerprint !== "string"
    || series.titleFingerprint !== createTitleFingerprint(series.apiTitles)
  ) {
    return false;
  }

  const apiTitles = series.apiTitles as SeriesTitle[];
  const rankedSearchTitles = series.rankedSearchTitles as string[];
  const resolvedTitles = resolveSeriesTitles(apiTitles, { mediaType: series.mediaType });
  if (
    !resolvedTitles
    || resolvedTitles.orderedTitles.length !== rankedSearchTitles.length
    || resolvedTitles.orderedTitles.some((title, index) => title !== rankedSearchTitles[index])
  ) {
    return false;
  }

  if (!isRecord(value.providers) || !isIsoTimestamp(value.searchedAt)) {
    return false;
  }
  return Object.entries(value.providers).every(
    ([providerId, state]) => isCachedProviderState(providerId, state, rankedSearchTitles.length),
  );
}

export function getObsoleteLookupCacheKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => key.startsWith("lookup:") && !key.startsWith(LOOKUP_CACHE_PREFIX));
}

export async function migrateLookupCacheStorage(storage: LookupStorageArea): Promise<string[]> {
  const schemaEntry = await storage.get(LOOKUP_CACHE_SCHEMA_KEY);
  if (schemaEntry[LOOKUP_CACHE_SCHEMA_KEY] === LOOKUP_CACHE_SCHEMA_VERSION) {
    return [];
  }

  const stored = await storage.get(null);
  const obsoleteKeys = getObsoleteLookupCacheKeys(Object.keys(stored));
  if (obsoleteKeys.length > 0) {
    await storage.remove(obsoleteKeys);
  }

  if (stored[LOOKUP_CACHE_SCHEMA_KEY] !== LOOKUP_CACHE_SCHEMA_VERSION) {
    await storage.set({ [LOOKUP_CACHE_SCHEMA_KEY]: LOOKUP_CACHE_SCHEMA_VERSION });
  }
  return obsoleteKeys;
}

export function shouldInvalidateProviderResults(
  cached: Pick<CachedMangaBakaSeries, "titleFingerprint">,
  currentTitles: readonly SeriesTitle[],
): boolean {
  return cached.titleFingerprint !== createTitleFingerprint(currentTitles);
}
