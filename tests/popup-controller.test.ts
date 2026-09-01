import { describe, expect, it } from "vitest";

import {
  getPopupStatusPresentation,
  resolvePopupRoute,
} from "../src/popup/controller";

describe("popup controller routing", () => {
  it("routes canonical and legacy MangaBaka series pages", () => {
    expect(resolvePopupRoute(
      "https://mangabaka.org/manhwa/588840/Got-Dropped-into-a-Ghost-Story?tab=info#top",
      {},
    )).toEqual({ kind: "mangabaka-series", seriesId: 588840 });
    expect(resolvePopupRoute("https://mangabaka.org/377", {}))
      .toEqual({ kind: "mangabaka-series", seriesId: 377 });
  });

  it("routes an enabled provider page and identifies a disabled provider", () => {
    const mangaDexUrl = "https://mangadex.org/title/05d3c7a0-428b-4bd5-9ee2-6bb0f30a0d75/one-piece";
    expect(resolvePopupRoute(mangaDexUrl, { mangadex: true })).toEqual({
      kind: "provider-page",
      providerId: "mangadex",
      pageType: "series",
    });
    expect(resolvePopupRoute(mangaDexUrl, { mangadex: false }))
      .toEqual({ kind: "unsupported", reason: "disabled-provider" });
  });

  it("distinguishes a missing URL from an unsupported page", () => {
    expect(resolvePopupRoute("", {})).toEqual({ kind: "unsupported", reason: "missing-url" });
    expect(resolvePopupRoute("https://example.org/not-supported", {}))
      .toEqual({ kind: "unsupported", reason: "unrecognized-url" });
  });
});

describe("popup controller presentation", () => {
  it("presents cached, retry, and reset states deterministically", () => {
    expect(getPopupStatusPresentation({
      kind: "lookup",
      enabledProviderIds: ["atsu"],
      outcomes: { atsu: { kind: "found", providerId: "atsu", value: {} } },
      fromCache: true,
    })).toEqual({ message: "Loaded cached result", tone: "success" });
    expect(getPopupStatusPresentation({ kind: "retry" }))
      .toEqual({ message: "Refreshing MangaBaka metadata...", tone: "loading" });
    expect(getPopupStatusPresentation({ kind: "reset" }))
      .toEqual({ message: "Clearing cached search...", tone: "loading" });
  });

  it("distinguishes complete, partial, and unavailable provider runs", () => {
    expect(getPopupStatusPresentation({
      kind: "lookup",
      enabledProviderIds: ["atsu", "mangadex"],
      outcomes: {
        atsu: { kind: "found", providerId: "atsu", value: {} },
        mangadex: { kind: "no_match", providerId: "mangadex" },
      },
      fromCache: false,
    })).toEqual({ message: "Search complete", tone: "success" });
    expect(getPopupStatusPresentation({
      kind: "lookup",
      enabledProviderIds: ["atsu", "mangadex"],
      outcomes: {
        atsu: { kind: "found", providerId: "atsu", value: {} },
        mangadex: { kind: "rate_limited", providerId: "mangadex" },
      },
      fromCache: false,
    })).toEqual({ message: "Search completed with some provider issues", tone: "error" });
    expect(getPopupStatusPresentation({
      kind: "lookup",
      enabledProviderIds: ["mangafire"],
      outcomes: { mangafire: { kind: "blocked", providerId: "mangafire" } },
      fromCache: false,
    })).toEqual({ message: "Provider searches are temporarily unavailable", tone: "error" });
  });

  it("reports the no-provider state before cache provenance", () => {
    expect(getPopupStatusPresentation({
      kind: "lookup",
      enabledProviderIds: [],
      outcomes: {},
      fromCache: true,
    })).toEqual({ message: "No providers enabled", tone: "error" });
  });
});
