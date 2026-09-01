import { describe, expect, it, vi } from "vitest";
import {
  ATSUMARU_ADAPTER,
  COMIX_ADAPTER,
  EHENTAI_ADAPTER,
  EXHENTAI_ADAPTER,
  MANGADEX_ADAPTER,
  MANGAFIRE_ADAPTER,
  WEEBCENTRAL_ADAPTER,
  buildAdultProviderSearchRequest,
  buildMangaDexChapterMetadataRequest,
  buildMangaDexChapterFeedRequest,
  buildMangaFireSearchRequest,
  buildWeebCentralSearchRequest,
  classifyMangaDexChapterAvailability,
  fetchProviderSearchRequest,
  fetchProviderText,
  matchAdultProviderPage,
  matchAtsumaruPage,
  matchComixPage,
  matchMangaDexPage,
  matchMangaFirePage,
  matchProviderPage,
  matchWeebCentralPage,
  parseAdultProviderSearchResponse,
  parseAtsumaruEmbeddedTitles,
  parseAtsumaruLatestChapterResponse,
  parseAtsumaruSearchResponse,
  parseMangaDexChapterSeriesResponse,
  parseMangaDexChapterFeedResponse,
  parseMangaDexSeriesTitlesResponse,
  parseMangaDexTitleMetadataResponse,
  parseMangaFireSearchResponse,
  parseRetryAfterMs,
  parseWeebCentralSearchResponse,
  pickHighestMangaDexChapterNumber,
  selectAdultSearchTerms,
  resolveStableProviderOutcome,
  transitionProviderSearch,
} from "../src/providers";

describe("provider route conventions", () => {
  it("matches Atsumaru manga and reader routes", () => {
    expect(matchAtsumaruPage("https://atsu.moe/manga/example-id")?.pageType).toBe("series");
    expect(matchAtsumaruPage("https://atsu.moe/read/example-id/chapter-id")?.chapterId).toBe("chapter-id");
  });

  it("canonicalizes MangaDex slugged series routes to the stable UUID route", () => {
    const id = "f9c33607-9180-4ba6-b85c-e4b5faee7192";
    expect(matchMangaDexPage(`https://www.mangadex.org/title/${id}/a-display-slug`)).toEqual({
      providerId: "mangadex",
      pageType: "series",
      sourceUrl: `https://www.mangadex.org/title/${id}/a-display-slug`,
      canonicalUrl: `https://mangadex.org/title/${id}`,
      seriesId: id,
      chapterId: null,
    });
  });

  it("accepts both current WeebCentral series route forms", () => {
    expect(matchWeebCentralPage("https://weebcentral.com/series/01JABCDEF0123456789ABCDEFX")?.seriesId)
      .toBe("01JABCDEF0123456789ABCDEFX");
    expect(matchWeebCentralPage("https://weebcentral.com/series/01JABCDEF0123456789ABCDEFX/a-slug")?.pageType)
      .toBe("series");
    expect(matchWeebCentralPage("https://weebcentral.com/chapters/01JCHAPTER0123456789ABCDE")?.pageType)
      .toBe("chapter");
  });

  it("matches MangaFire series and reader routes", () => {
    expect(matchMangaFirePage("https://mangafire.to/manga/example-title.abc12")?.seriesId).toBe("abc12");
    expect(matchMangaFirePage("https://mangafire.to/read/example-title.abc12/en/chapter-17")?.chapterId)
      .toBe("en/chapter-17");
  });

  it("keeps Comix discoverable but out of normal matching", () => {
    const url = "https://comix.to/title/abc123-example-title";
    expect(COMIX_ADAPTER.availability).toBe("planned");
    expect(matchComixPage(url)?.seriesId).toBe("abc123");
    expect(matchProviderPage(url)).toBeNull();
    expect(matchProviderPage(url, { includePlanned: true })).toEqual(expect.objectContaining({
      kind: "unsupported",
      providerId: "comixto",
    }));
  });
});

describe("MangaDex chapter state", () => {
  const availableFeed = {
    chapters: [
      { id: "new-publish", chapter: "1188", translatedLanguage: "en", publishAt: "2026-08-30", externalUrl: null },
      { id: "high-number", chapter: "1191", translatedLanguage: "en", publishAt: "2026-08-20", externalUrl: null },
    ],
    total: 2,
  };

  it("requests English chapters ordered by chapter number", () => {
    const request = new URL(buildMangaDexChapterFeedRequest("manga-id").url);
    expect(request.searchParams.get("translatedLanguage[]")).toBe("en");
    expect(request.searchParams.get("order[chapter]")).toBe("desc");
    expect(request.searchParams.has("includeUnavailable")).toBe(false);
  });

  it("resolves chapter metadata to the included parent series titles", () => {
    const chapterId = "22270669-7c5d-43b2-bb73-1369e9fec119";
    expect(buildMangaDexChapterMetadataRequest(chapterId).url).toBe(
      `https://api.mangadex.org/chapter/${chapterId}?includes[]=manga`,
    );

    expect(parseMangaDexChapterSeriesResponse(JSON.stringify({
      data: {
        relationships: [{
          id: "a1c7c817-4e59-43b7-9365-09675a149a6f",
          type: "manga",
          attributes: {
            title: { "ja-ro": "One Piece" },
            altTitles: [{ en: "ONE PIECE" }, { ja: "ワンピース" }],
          },
        }],
      },
    }))).toEqual(expect.objectContaining({
      kind: "found",
      value: expect.objectContaining({
        seriesId: "a1c7c817-4e59-43b7-9365-09675a149a6f",
        titles: ["One Piece", "ワンピース"],
      }),
    }));
  });

  it("retains a relationship id when chapter metadata omits embedded titles", () => {
    expect(parseMangaDexChapterSeriesResponse(JSON.stringify({
      data: {
        relationships: [{
          id: "a1c7c817-4e59-43b7-9365-09675a149a6f",
          type: "manga",
        }],
      },
    }))).toEqual(expect.objectContaining({
      kind: "found",
      value: {
        seriesId: "a1c7c817-4e59-43b7-9365-09675a149a6f",
        titles: [],
      },
    }));

    expect(parseMangaDexSeriesTitlesResponse(JSON.stringify({
      data: {
        id: "a1c7c817-4e59-43b7-9365-09675a149a6f",
        attributes: { title: { en: "One Piece" }, altTitles: [] },
      },
    }))).toEqual(expect.objectContaining({
      kind: "found",
      value: expect.objectContaining({ titles: ["One Piece"] }),
    }));
  });

  it("rejects chapter metadata without a valid parent manga relationship", () => {
    expect(parseMangaDexChapterSeriesResponse(JSON.stringify({
      data: { relationships: [{ id: "not-a-uuid", type: "manga" }] },
    }))).toEqual(expect.objectContaining({ kind: "error" }));
  });

  it("selects the highest chapter rather than the latest publish timestamp", () => {
    expect(pickHighestMangaDexChapterNumber(availableFeed.chapters)).toBe("1191");
    expect(classifyMangaDexChapterAvailability(
      availableFeed,
      { availableTranslatedLanguages: ["en"] },
    )).toEqual({
      state: "available",
      latestChapterNumber: "1191",
    });
  });

  it("compares decimal chapter numbers numerically and retains external chapters", () => {
    const parsed = parseMangaDexChapterFeedResponse(JSON.stringify({
      total: 3,
      data: [
        {
          id: "external-decimal",
          attributes: {
            chapter: "10.2",
            translatedLanguage: "en",
            externalUrl: "https://publisher.example/chapter/10-2",
          },
        },
        { id: "lower-decimal", attributes: { chapter: "10.10", translatedLanguage: "en" } },
        { id: "integer", attributes: { chapter: "10", translatedLanguage: "en" } },
      ],
    }));

    expect(parsed.kind).toBe("found");
    if (parsed.kind === "found") {
      expect(pickHighestMangaDexChapterNumber(parsed.value.chapters)).toBe("10.2");
      expect(parsed.value.chapters[0]).toMatchObject({
        id: "external-decimal",
        externalUrl: "https://publisher.example/chapter/10-2",
      });
    }
  });

  it("distinguishes purged English chapters from no chapters or translations", () => {
    expect(classifyMangaDexChapterAvailability(
      { chapters: [], total: 0 },
      { availableTranslatedLanguages: ["en", "es"] },
    )).toEqual({ state: "purged", latestChapterNumber: null });
    expect(classifyMangaDexChapterAvailability(
      { chapters: [], total: 0 },
      { availableTranslatedLanguages: ["ja"] },
    )).toEqual({ state: "no_chapters_tld", latestChapterNumber: null });
  });

  it("uses numeric English evidence rather than treating numberless records as available", () => {
    const numberlessFeed = {
      chapters: [
        { id: "oneshot", chapter: null, translatedLanguage: "en", publishAt: null, externalUrl: null },
      ],
      total: 1,
    };
    expect(classifyMangaDexChapterAvailability(
      numberlessFeed,
      { availableTranslatedLanguages: ["en"] },
    )).toEqual({ state: "purged", latestChapterNumber: null });
    expect(classifyMangaDexChapterAvailability(
      numberlessFeed,
      { availableTranslatedLanguages: ["ja"] },
    )).toEqual({ state: "no_chapters_tld", latestChapterNumber: null });
  });

  it("parses availableTranslatedLanguages from MangaDex title metadata", () => {
    const parsed = parseMangaDexTitleMetadataResponse(JSON.stringify({
      data: { attributes: { availableTranslatedLanguages: ["en", "ja", "en"] } },
    }));
    expect(parsed).toEqual(expect.objectContaining({
      kind: "found",
      value: { availableTranslatedLanguages: ["en", "ja"] },
    }));
  });

  it("filters non-English feed records even if an upstream response is broader", () => {
    const parsed = parseMangaDexChapterFeedResponse(JSON.stringify({
      total: 2,
      data: [
        { id: "en", attributes: { translatedLanguage: "en", chapter: "10" } },
        { id: "jp", attributes: { translatedLanguage: "ja", chapter: "11" } },
      ],
    }));
    expect(parsed.kind).toBe("found");
    if (parsed.kind === "found") {
      expect(parsed.value.chapters.map((chapter) => chapter.id)).toEqual(["en"]);
    }
  });
});

describe("first-party search parsers", () => {
  it("builds and parses WeebCentral's non-adult fragment search", () => {
    const request = new URL(buildWeebCentralSearchRequest("Example Title").url);
    expect(request.pathname).toBe("/search/data");
    expect(request.searchParams.get("adult")).toBe("False");
    expect(request.searchParams.get("text")).toBe("Example Title");

    const parsed = parseWeebCentralSearchResponse(`
      <a href="/series/01JABCDEF0123456789ABCDEFX/example-title"><span>Example Title</span></a>
      <a href="/series/01JABCDEF0123456789ABCDEFX">duplicate</a>
    `);
    expect(parsed.kind).toBe("found");
    if (parsed.kind === "found") {
      expect(parsed.value).toHaveLength(1);
      expect(parsed.value[0].url).toContain("/series/01JABCDEF0123456789ABCDEFX/example-title");
    }
  });

  it("parses MangaFire results while retaining a manual fallback URL", () => {
    const request = buildMangaFireSearchRequest("Example Title");
    expect(request.forbiddenOutcome).toBe("blocked");
    expect(request.url).toBe("https://mangafire.to/filter?keyword=Example+Title");

    const parsed = parseMangaFireSearchResponse(`
      <a href="/manga/example-title.abc12"><strong>Example Title</strong></a>
      <a href="/read/example-title.abc12/en/chapter-1">reader link</a>
    `);
    expect(parsed.kind).toBe("found");
    if (parsed.kind === "found") {
      expect(parsed.value).toEqual([expect.objectContaining({ title: "Example Title", seriesId: "abc12" })]);
    }
  });

  it("classifies HTTP-200 anti-bot challenges as blocked", () => {
    const challenge = '<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script></html>';
    expect(parseMangaFireSearchResponse(challenge)).toEqual(expect.objectContaining({ kind: "blocked" }));
    expect(parseWeebCentralSearchResponse(challenge)).toEqual(expect.objectContaining({ kind: "blocked" }));
  });

  it("does not mistake ordinary Cloudflare analytics for a challenge", () => {
    const analytics = '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>';
    expect(parseMangaFireSearchResponse(
      `${analytics}<a href="/manga/example-title.abc12">Example Title</a>`,
    )).toEqual(expect.objectContaining({ kind: "found" }));
    expect(parseWeebCentralSearchResponse(
      `${analytics}<a href="/series/01JABCDEF0123456789ABCDEFX/example-title">Example Title</a>`,
    )).toEqual(expect.objectContaining({ kind: "found" }));
  });
});

describe("Atsumaru response helpers", () => {
  it("does not turn an HTTP-200 endpoint error object into a genuine miss", () => {
    expect(parseAtsumaruSearchResponse('{"error":"search unavailable"}')).toEqual(expect.objectContaining({
      kind: "error",
      errorType: "invalid_response",
    }));
  });

  it("extracts all embedded title variants", () => {
    const parsed = parseAtsumaruEmbeddedTitles(
      'window.mangaPage = {"mangaPage":{"title":"Primary","englishTitle":"English","otherNames":["Alias"]}};',
    );
    expect(parsed).toEqual(expect.objectContaining({ kind: "found", value: ["Primary", "English", "Alias"] }));
  });

  it("sorts chapter numbers ahead of timestamps", () => {
    const parsed = parseAtsumaruLatestChapterResponse(JSON.stringify({
      mangaPage: {
        chapters: [
          { id: "recent", number: "8", createdAt: 20 },
          { id: "higher", number: "10", createdAt: 10 },
        ],
      },
    }));
    expect(parsed).toEqual(expect.objectContaining({
      kind: "found",
      value: expect.objectContaining({ chapterId: "higher", number: "10" }),
    }));
  });
});

describe("adult providers remain fixture-only", () => {
  it("matches documented gallery and image routes without network access", () => {
    expect(matchAdultProviderPage("ehentai", "https://e-hentai.org/g/12345/token/")?.pageType).toBe("series");
    expect(matchAdultProviderPage("exhentai", "https://exhentai.org/s/hash/12345-7")?.chapterId)
      .toBe("hash/12345-7");
    expect(EHENTAI_ADAPTER.liveTestPolicy).toBe("fixture_only");
    expect(EXHENTAI_ADAPTER.liveTestPolicy).toBe("fixture_only");
  });

  it("uses explicit credential policy and only a bounded whole-title search", () => {
    expect(buildAdultProviderSearchRequest("ehentai", "Example Title").credentialPolicy).toBe("omit");
    expect(buildAdultProviderSearchRequest("exhentai", "Example Title")).toEqual(expect.objectContaining({
      credentialPolicy: "include",
      forbiddenOutcome: "auth_required",
    }));
    expect(selectAdultSearchTerms(["Primary", "Alternate"], 1)).toEqual(["Alternate"]);
  });

  it("parses only synthetic gallery fixtures", () => {
    const parsed = parseAdultProviderSearchResponse(
      "ehentai",
      '<a href="/g/12345/token/"><span>[Artist] Example Gallery</span></a>',
    );
    expect(parsed).toEqual(expect.objectContaining({
      kind: "found",
      value: [expect.objectContaining({ title: "Example Gallery", seriesId: "12345/token" })],
    }));
  });

  it("classifies synthetic ExHentai login HTML as auth-required", () => {
    const parsed = parseAdultProviderSearchResponse(
      "exhentai",
      '<form action="/login.php"><input name="UserName"><input name="PassWord"></form>',
    );
    expect(parsed).toEqual(expect.objectContaining({ kind: "auth_required", providerId: "exhentai" }));
  });

  it("lets a valid ExHentai gallery win over ordinary forum navigation", () => {
    const parsed = parseAdultProviderSearchResponse(
      "exhentai",
      '<a href="https://forums.e-hentai.org/index.php">Forums</a><a href="/g/12345/token/">Example Gallery</a>',
    );
    expect(parsed).toEqual(expect.objectContaining({
      kind: "found",
      value: [expect.objectContaining({ seriesId: "12345/token" })],
    }));
  });
});

describe("shared provider transport outcomes", () => {
  it("invokes fetch with the browser global receiver", async () => {
    const fetchImpl = vi.fn(function (this: unknown): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;

    await expect(fetchProviderText({
      providerId: "mangadex",
      url: "https://api.mangadex.org/chapter/example",
      credentialPolicy: "omit",
      fetchImpl,
    })).resolves.toMatchObject({ kind: "found", value: { body: "ok" } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("parses numeric and date Retry-After values", () => {
    expect(parseRetryAfterMs("3")).toBe(3_000);
    expect(parseRetryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 5_000)).toBe(5_000);
  });

  it("maps provider blocks without collapsing them into no-match", async () => {
    const fetchImpl = vi.fn(async () => new Response("blocked", { status: 403 })) as unknown as typeof fetch;
    const outcome = await fetchProviderSearchRequest(
      "mangafire",
      buildMangaFireSearchRequest("Example"),
      { fetchImpl },
    );
    expect(outcome.kind).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: "omit" }));
  });

  it("maps credential-gated 403 responses to auth-required", async () => {
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    const outcome = await fetchProviderSearchRequest(
      "exhentai",
      buildAdultProviderSearchRequest("exhentai", "Example"),
      { fetchImpl },
    );
    expect(outcome.kind).toBe("auth_required");
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: "include" }));
  });

  it("preserves rate limits and ordinary provider outages as distinct outcomes", async () => {
    const rateLimitedFetch = vi.fn(async () => new Response("slow down", {
      status: 429,
      headers: { "retry-after": "2" },
    })) as unknown as typeof fetch;
    const rateLimited = await fetchProviderText({
      providerId: "mangadex",
      url: "https://api.mangadex.org/manga",
      credentialPolicy: "omit",
      fetchImpl: rateLimitedFetch,
    });
    expect(rateLimited).toEqual(expect.objectContaining({ kind: "rate_limited", retryAfterMs: 2_000 }));

    const unavailableFetch = vi.fn(async () => new Response("maintenance", { status: 503 })) as unknown as typeof fetch;
    const unavailable = await fetchProviderText({
      providerId: "mangadex",
      url: "https://api.mangadex.org/manga",
      credentialPolicy: "omit",
      fetchImpl: unavailableFetch,
    });
    expect(unavailable).toEqual(expect.objectContaining({ kind: "unavailable", reason: "http" }));
  });

  it("does not treat a generic HTTP 404 as an authoritative search miss", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 })) as unknown as typeof fetch;
    const outcome = await fetchProviderText({
      providerId: "mangadex",
      url: "https://api.mangadex.org/manga/missing",
      credentialPolicy: "omit",
      fetchImpl,
    });
    expect(outcome).toEqual(expect.objectContaining({
      kind: "unavailable",
      reason: "http",
      httpStatus: 404,
    }));
  });

  it("reports timeouts separately from generic network errors", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as unknown as typeof fetch;
    const outcome = await fetchProviderText({
      providerId: "atsu",
      url: "https://atsu.moe/test",
      credentialPolicy: "omit",
      timeoutMs: 1,
      fetchImpl,
    });
    expect(outcome).toEqual(expect.objectContaining({ kind: "unavailable", reason: "timeout" }));
  });

  it("recognizes AbortError instances outside DOMException", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const fetchImpl = vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;
    const outcome = await fetchProviderText({
      providerId: "atsu",
      url: "https://atsu.moe/test",
      credentialPolicy: "omit",
      fetchImpl,
    });
    expect(outcome).toEqual(expect.objectContaining({ kind: "unavailable", reason: "aborted" }));
  });
});

describe("adapter metadata", () => {
  it("keeps current defaults and planned status explicit", () => {
    expect(ATSUMARU_ADAPTER.enabledByDefault).toBe(true);
    expect(COMIX_ADAPTER.enabledByDefault).toBe(false);
    expect(COMIX_ADAPTER.availability).toBe("planned");
  });

  it("declares the provider homepages used by clickable popup labels", () => {
    expect([
      ATSUMARU_ADAPTER.homepageUrl,
      MANGADEX_ADAPTER.homepageUrl,
      MANGAFIRE_ADAPTER.homepageUrl,
      WEEBCENTRAL_ADAPTER.homepageUrl,
      COMIX_ADAPTER.homepageUrl,
    ]).toEqual([
      "https://atsu.moe/",
      "https://mangadex.org/",
      "https://mangafire.to/",
      "https://weebcentral.com/",
      "https://comix.to/",
    ]);
  });
});

describe("provider cache outcomes", () => {
  it("never turns a transient outage into a persisted no-match", () => {
    expect(resolveStableProviderOutcome(
      "mangafire",
      { kind: "blocked", providerId: "mangafire" },
      null,
    )).toBeNull();
    expect(resolveStableProviderOutcome(
      "mangafire",
      undefined,
      null,
    )).toBeNull();
    expect(resolveStableProviderOutcome(
      "comixto",
      { kind: "unsupported", providerId: "comixto" },
      null,
    )).toBeNull();
  });

  it("advances and commits only stable results or genuine misses", () => {
    const previous = { result: { title: "Stable" }, searched: true, titleCursor: 2 };
    const transientKinds = ["blocked", "rate_limited", "auth_required", "unavailable", "error", "unsupported"] as const;
    for (const kind of transientKinds) {
      const outcome = kind === "unavailable"
        ? { kind, providerId: "mangafire" as const, reason: "network" as const }
        : kind === "error"
          ? { kind, providerId: "mangafire" as const, errorType: "invalid_response" as const }
          : { kind, providerId: "mangafire" as const };
      expect(transitionProviderSearch(previous, 3, outcome)).toEqual({ commit: false, ...previous });
    }

    expect(transitionProviderSearch(
      previous,
      3,
      { kind: "no_match", providerId: "mangafire" },
    )).toEqual({ commit: true, result: null, searched: true, titleCursor: 3 });
    expect(transitionProviderSearch(
      previous,
      3,
      { kind: "found", providerId: "mangafire", value: { title: "Replacement" } },
    )).toEqual({ commit: true, result: { title: "Replacement" }, searched: true, titleCursor: 3 });
  });
});
