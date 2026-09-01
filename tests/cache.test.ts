import { describe, expect, it, vi } from "vitest";

import {
  createTitleFingerprint,
  getLookupCacheKey,
  getObsoleteLookupCacheKeys,
  isLookupCacheV12,
  LOOKUP_CACHE_SCHEMA_KEY,
  LOOKUP_CACHE_SCHEMA_VERSION,
  migrateLookupCacheStorage,
  shouldInvalidateProviderResults,
  type LookupStorageArea,
} from "../src/lookup/cache";
import type { SeriesTitle } from "../src/domain/titles";

function title(value: string): SeriesTitle {
  return { language: "en", traits: ["official"], title: value, note: null, isPrimary: true };
}

function providerMatch(overrides: Record<string, unknown> = {}) {
  return {
    provider: "MangaDex",
    title: "ONE PIECE",
    url: "https://mangadex.org/title/05d3c7a0-428b-4bd5-9ee2-6bb0f30a0d75",
    latestChapterNumber: "1191",
    latestChapterLanguage: "en",
    mangaDexChapterState: null,
    manualMangaDexChapterState: null,
    manualPurgedChapterNumber: null,
    ...overrides,
  };
}

function cacheRecord(providers: Record<string, unknown> = {}) {
  const apiTitles = [title("ONE PIECE")];
  return {
    schemaVersion: 12,
    series: {
      requestedSeriesId: 377,
      id: 377,
      canonicalUrl: "https://mangabaka.org/manga/377/ONE-PIECE",
      mediaType: "manga",
      apiTitles,
      rankedSearchTitles: ["ONE PIECE"],
      authors: ["Eiichirou Oda"],
      apiLastUpdatedAt: "2026-08-30T17:53:41.916Z",
      titleFingerprint: createTitleFingerprint(apiTitles),
    },
    providers,
    searchedAt: "2026-08-31T00:00:00.000Z",
  };
}

describe("lookup cache v12", () => {
  it("uses the versioned per-series key", () => {
    expect(getLookupCacheKey(377)).toBe("lookup:v12:377");
    expect(() => getLookupCacheKey("0")).toThrow();
  });

  it("removes only obsolete lookup keys and preserves settings/releases/current entries", async () => {
    const entries: Record<string, unknown> = {
      "lookup:377": { version: 11 },
      "lookup:v11:12": { version: 11 },
      "lookup:v12:99": { schemaVersion: 12 },
      "extension:settings": { enabledProviders: { atsu: true } },
      "extension:release-update": { status: "up_to_date" },
    };
    const remove = vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete entries[key];
    });
    const set = vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(entries, items);
    });
    const storage: LookupStorageArea = {
      get: vi.fn(async () => ({ ...entries })),
      remove,
      set,
    };

    await expect(migrateLookupCacheStorage(storage)).resolves.toEqual(["lookup:377", "lookup:v11:12"]);
    expect(entries).toMatchObject({
      "lookup:v12:99": { schemaVersion: 12 },
      "extension:settings": { enabledProviders: { atsu: true } },
      "extension:release-update": { status: "up_to_date" },
      [LOOKUP_CACHE_SCHEMA_KEY]: LOOKUP_CACHE_SCHEMA_VERSION,
    });
    expect(getObsoleteLookupCacheKeys(Object.keys(entries))).toEqual([]);

    await expect(migrateLookupCacheStorage(storage)).resolves.toEqual([]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(storage.get).toHaveBeenNthCalledWith(1, LOOKUP_CACHE_SCHEMA_KEY);
    expect(storage.get).toHaveBeenNthCalledWith(2, null);
    expect(storage.get).toHaveBeenNthCalledWith(3, LOOKUP_CACHE_SCHEMA_KEY);
  });

  it("does not scan all storage after the v12 migration marker is present", async () => {
    const storage: LookupStorageArea = {
      get: vi.fn(async (keys) => keys === LOOKUP_CACHE_SCHEMA_KEY
        ? { [LOOKUP_CACHE_SCHEMA_KEY]: LOOKUP_CACHE_SCHEMA_VERSION }
        : { "lookup:v11:377": { stale: true } }),
      remove: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };

    await expect(migrateLookupCacheStorage(storage)).resolves.toEqual([]);
    expect(storage.get).toHaveBeenCalledOnce();
    expect(storage.get).toHaveBeenCalledWith(LOOKUP_CACHE_SCHEMA_KEY);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("invalidates provider results only when the API title fingerprint changes", () => {
    const onePiece = [title("ONE PIECE")];
    const cached = { titleFingerprint: createTitleFingerprint(onePiece) };
    expect(shouldInvalidateProviderResults(cached, [title("One Piece")])).toBe(false);
    expect(shouldInvalidateProviderResults(cached, [title("ONE PIECE"), title("Wanpiisu")])).toBe(true);
  });

  it("accepts only internally consistent cached API records", () => {
    const record = cacheRecord();

    expect(isLookupCacheV12(record)).toBe(true);
    expect(isLookupCacheV12({
      ...record,
      series: { ...record.series, canonicalUrl: "https://mangabaka.org/manga/999/wrong" },
    })).toBe(false);
    expect(isLookupCacheV12({
      ...record,
      series: { ...record.series, titleFingerprint: "stale" },
    })).toBe(false);
    expect(isLookupCacheV12({
      ...record,
      series: { ...record.series, rankedSearchTitles: ["Injected search title"] },
    })).toBe(false);
    expect(isLookupCacheV12({
      ...record,
      series: { ...record.series, apiTitles: [{ title: "unvalidated" }] },
    })).toBe(false);
    expect(isLookupCacheV12({ ...record, searchedAt: "2026-08-31" })).toBe(false);
  });

  it("accepts stable provider fallback state and rejects transient or internally inconsistent state", () => {
    const match = providerMatch();
    const stableFound = {
      searched: true,
      result: match,
      outcome: { kind: "found", providerId: "mangadex", value: { ...match } },
      rejectedUrls: [],
      titleCursor: 0,
    };
    expect(isLookupCacheV12(cacheRecord({ mangadex: stableFound }))).toBe(true);
    expect(isLookupCacheV12(cacheRecord({
      mangadex: { ...stableFound, outcome: { kind: "blocked", providerId: "mangadex" } },
    }))).toBe(false);
    expect(isLookupCacheV12(cacheRecord({
      mangadex: {
        ...stableFound,
        outcome: {
          kind: "found",
          providerId: "mangadex",
          value: providerMatch({ url: "https://mangadex.org/title/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        },
      },
    }))).toBe(false);
  });

  it("rejects provider matches whose identity, fields, or rejected URLs do not belong to that provider", () => {
    const match = providerMatch();
    const foundState = {
      searched: true,
      result: match,
      outcome: { kind: "found", providerId: "mangadex", value: { ...match } },
      rejectedUrls: [],
      titleCursor: 0,
    };

    for (const invalidMatch of [
      providerMatch({ provider: "MangaFire" }),
      providerMatch({ latestChapterLanguage: "ja" }),
      providerMatch({ latestChapterNumber: undefined }),
      providerMatch({ mangaDexChapterState: "available" }),
      providerMatch({ url: "https://mangafire.to/manga/one-piece" }),
    ]) {
      expect(isLookupCacheV12(cacheRecord({
        mangadex: {
          ...foundState,
          result: invalidMatch,
          outcome: { kind: "found", providerId: "mangadex", value: { ...invalidMatch } },
        },
      }))).toBe(false);
    }

    expect(isLookupCacheV12(cacheRecord({
      mangadex: { ...foundState, rejectedUrls: ["https://mangafire.to/manga/one-piece"] },
    }))).toBe(false);
  });

  it("accepts a metadata-only fallback record after title invalidation", () => {
    const record = cacheRecord({
      mangadex: {
        searched: false,
        result: null,
        outcome: null,
        rejectedUrls: [],
        titleCursor: 0,
      },
    });

    expect(isLookupCacheV12(record)).toBe(true);
    expect(shouldInvalidateProviderResults(record.series, record.series.apiTitles)).toBe(false);
  });
});
