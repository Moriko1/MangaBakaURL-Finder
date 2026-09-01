import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import {
  readActivePageContextFromDocument,
  sanitizeElementReadyContext,
} from "../src/mangabaka/context";

function seriesDocument(url = "https://mangabaka.org/manga/377/ONE-PIECE") {
  return new JSDOM(`
    <!doctype html>
    <main><h1 lang="en">  ONE   PIECE </h1></main>
    <div id="ratings" data-browser-extension-injection="ratings"></div>
  `, { url }).window.document;
}

describe("MangaBaka active page context", () => {
  it("sanitizes element-ready detail to the minimal active-page contract", () => {
    const documentNode = seriesDocument();
    const context = sanitizeElementReadyContext({
      name: "ratings",
      element_id: "ratings",
      series: {
        id: 377,
        type: "manga",
        canonical_url: "https://mangabaka.org/manga/377/ONE-PIECE",
        titles: [{ title: "must not be retained" }],
        authors: ["must not be retained"],
      },
      library_series: { read_link: "must not be read" },
      user: { email: "must not be read" },
    }, documentNode, "2026-08-30T23:00:00.000Z");

    expect(context).toEqual({
      version: 1,
      kind: "mangabaka-series",
      url: "https://mangabaka.org/manga/377/ONE-PIECE",
      seriesId: 377,
      mediaType: "manga",
      canonicalUrl: "https://mangabaka.org/manga/377/ONE-PIECE",
      resolvedTitle: "ONE PIECE",
      observedAt: "2026-08-30T23:00:00.000Z",
      readiness: "element-ready",
    });
    expect(JSON.stringify(context)).not.toContain("read_link");
    expect(JSON.stringify(context)).not.toContain("authors");
  });

  it("rejects mismatched series ids and fake integration element ids", () => {
    const documentNode = seriesDocument();
    const base = {
      element_id: "ratings",
      series: {
        id: 999,
        type: "manga",
        canonical_url: "https://mangabaka.org/manga/999/wrong",
      },
    };
    expect(sanitizeElementReadyContext(base, documentNode, new Date().toISOString())).toBeNull();
    expect(sanitizeElementReadyContext({ ...base, element_id: "missing" }, documentNode, new Date().toISOString())).toBeNull();
  });

  it("reads only canonical URL identity and the main h1 from the rendered document", () => {
    const documentNode = seriesDocument();
    expect(readActivePageContextFromDocument(documentNode, "page-ready", "2026-08-30T23:00:00.000Z"))
      .toMatchObject({
        seriesId: 377,
        mediaType: "manga",
        resolvedTitle: "ONE PIECE",
        readiness: "page-ready",
      });
  });

  it("retains URL-only legacy identity and the rendered heading without reading document metadata", () => {
    const dom = new JSDOM(`
      <main><h1 lang="en">ONE PIECE</h1></main>
      <script type="application/ld+json">${JSON.stringify({
        "@graph": [{
          "@type": "ComicSeries",
          identifier: { "@type": "PropertyValue", value: 377 },
          url: "https://mangabaka.org/manga/377/ONE-PIECE",
          alternateName: ["must not be retained"],
        }],
      })}</script>
    `, { url: "https://mangabaka.org/377" });

    const context = readActivePageContextFromDocument(
      dom.window.document,
      "dom-ready",
      "2026-08-30T23:00:00.000Z",
    );
    expect(context).toMatchObject({
      kind: "mangabaka-series",
      seriesId: 377,
      mediaType: null,
      canonicalUrl: null,
      resolvedTitle: "ONE PIECE",
    });
    expect(JSON.stringify(context)).not.toContain("alternateName");
  });

  it("ignores an h1 without a language identity", () => {
    const documentNode = seriesDocument();
    documentNode.querySelector("h1")?.removeAttribute("lang");
    expect(readActivePageContextFromDocument(
      documentNode,
      "page-ready",
      "2026-08-30T23:00:00.000Z",
    )).toBeNull();
  });

  it.each(["display: none", "visibility: hidden"])("ignores a visually hidden h1 (%s)", (style) => {
    const documentNode = seriesDocument();
    documentNode.querySelector("h1")?.setAttribute("style", style);
    expect(readActivePageContextFromDocument(
      documentNode,
      "page-ready",
      "2026-08-30T23:00:00.000Z",
    )).toBeNull();
  });
});
