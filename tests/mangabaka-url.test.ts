import { describe, expect, it } from "vitest";

import { MANGA_MEDIA_TYPES } from "../src/domain/media";
import {
  isMangaBakaPageUrl,
  parseMangaBakaSeriesUrl,
  validateCanonicalMangaBakaSeriesUrl,
} from "../src/mangabaka/url";

describe("parseMangaBakaSeriesUrl", () => {
  for (const mediaType of MANGA_MEDIA_TYPES) {
    it(`parses canonical ${mediaType} URLs`, () => {
      expect(parseMangaBakaSeriesUrl(`https://mangabaka.org/${mediaType}/377/ONE-PIECE/?view=info#top`)).toEqual({
        seriesId: 377,
        mediaType,
        slug: "ONE-PIECE",
        isLegacy: false,
      });
    });
  }

  it("accepts a legacy numeric route until MangaBaka redirects it", () => {
    expect(parseMangaBakaSeriesUrl("https://mangabaka.org/377")).toEqual({
      seriesId: 377,
      mediaType: null,
      slug: null,
      isLegacy: true,
    });
  });

  it.each([
    "https://mangabaka.org/",
    "https://mangabaka.org/search?q=one-piece",
    "https://mangabaka.org/manga",
    "https://mangabaka.org/manga/not-a-number/title",
    "https://mangabaka.org/manga/0/title",
    "https://mangabaka.org/Manga/377/title",
    "https://www.mangabaka.org/manga/377/title",
    "https://mangabaka.org.evil.example/manga/377/title",
    "http://mangabaka.org/manga/377/title",
  ])("rejects non-series or non-canonical input %s", (url) => {
    expect(parseMangaBakaSeriesUrl(url)).toBeNull();
  });

  it("requires a slug when validating an API canonical URL", () => {
    expect(validateCanonicalMangaBakaSeriesUrl("https://mangabaka.org/manga/377", 377, "manga")).toBeNull();
    expect(validateCanonicalMangaBakaSeriesUrl("https://mangabaka.org/manga/377/ONE-PIECE", 377, "manga"))
      .toMatchObject({ seriesId: 377, mediaType: "manga", slug: "ONE-PIECE" });
  });

  it("keeps the action active throughout the secure MangaBaka site", () => {
    expect(isMangaBakaPageUrl("https://mangabaka.org/")).toBe(true);
    expect(isMangaBakaPageUrl("https://mangabaka.org/search?q=one-piece")).toBe(true);
    expect(isMangaBakaPageUrl("https://mangabaka.org/my/library")).toBe(true);
    expect(isMangaBakaPageUrl("http://mangabaka.org/")).toBe(false);
    expect(isMangaBakaPageUrl("https://mangabaka.org.evil.example/")).toBe(false);
  });
});
