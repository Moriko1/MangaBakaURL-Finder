import { describe, expect, it } from "vitest";

import {
  createUnsupportedPageContext,
  isMangaBakaSeriesPageContext,
  type ActivePageContext,
  type MangaBakaSeriesPageContext,
  type ProviderPageContext,
} from "../src/domain/active-page";

function describeContext(context: ActivePageContext): string {
  switch (context.kind) {
    case "mangabaka-series":
      return `series:${context.seriesId}`;
    case "provider-page":
      return `provider:${context.providerKey}:${context.pageType ?? "root"}`;
    case "unsupported":
      return `unsupported:${context.reason}`;
  }
}

describe("ActivePageContext", () => {
  it("discriminates MangaBaka, provider, and unsupported popup routes", () => {
    const mangaBaka: MangaBakaSeriesPageContext = {
      version: 1,
      kind: "mangabaka-series",
      url: "https://mangabaka.org/manga/377/ONE-PIECE",
      seriesId: 377,
      mediaType: "manga",
      canonicalUrl: "https://mangabaka.org/manga/377/ONE-PIECE",
      resolvedTitle: "ONE PIECE",
      observedAt: "2026-08-31T00:00:00.000Z",
      readiness: "page-ready",
    };
    const provider: ProviderPageContext = {
      version: 1,
      kind: "provider-page",
      url: "https://mangadex.org/title/f9c33607-9180-4ba6-b85c-e4b5faee7192",
      providerKey: "mangadex",
      providerLabel: "MangaDex",
      pageType: "series",
      primaryTitle: "One Piece",
      titles: ["One Piece"],
      sourceUrl: "https://mangadex.org/title/f9c33607-9180-4ba6-b85c-e4b5faee7192",
      isSearchable: true,
    };
    const unsupported = createUnsupportedPageContext("https://example.org/");

    expect([mangaBaka, provider, unsupported].map(describeContext)).toEqual([
      "series:377",
      "provider:mangadex:series",
      "unsupported:unrecognized-url",
    ]);
    expect(isMangaBakaSeriesPageContext(mangaBaka)).toBe(true);
    expect(isMangaBakaSeriesPageContext(provider)).toBe(false);
  });

  it("distinguishes an absent tab URL from an unrecognized URL", () => {
    expect(createUnsupportedPageContext("")).toMatchObject({
      kind: "unsupported",
      reason: "missing-url",
    });
    expect(createUnsupportedPageContext("https://example.org/", "disabled-provider")).toMatchObject({
      kind: "unsupported",
      reason: "disabled-provider",
    });
  });
});
