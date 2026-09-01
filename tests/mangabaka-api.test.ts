import { describe, expect, it, vi } from "vitest";

import {
  buildMangaBakaSeriesApiUrl,
  MangaBakaApiClient,
  MangaBakaApiError,
} from "../src/mangabaka/api";

function activeSeries(id = 377) {
  return {
    id,
    state: "active",
    merged_with: null,
    canonical_url: `https://mangabaka.org/manga/${id}/ONE-PIECE`,
    type: "manga",
    authors: ["Eiichirou Oda"],
    last_updated_at: "2026-08-30T17:53:41.916Z",
    titles: [
      { language: "en", traits: ["official"], title: "ONE PIECE", note: null, is_primary: true },
    ],
  };
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ status, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MangaBakaApiClient", () => {
  it("uses the v2 full endpoint and validates/carries cache metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      ...activeSeries(),
      titles: [
        { language: "en", traits: ["official"], title: "ONE PIECE", note: null, is_primary: true },
        { language: "en", traits: "bad", title: "skip me", note: null, is_primary: false },
      ],
    }));

    await expect(new MangaBakaApiClient({ fetcher }).getSeries(377)).resolves.toMatchObject({
      requestedSeriesId: 377,
      id: 377,
      mergedFrom: null,
      apiLastUpdatedAt: "2026-08-30T17:53:41.916Z",
      titles: [{ title: "ONE PIECE" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.mangabaka.org/v2/series/377?schema=full");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  });

  it("invokes fetch with the browser global receiver", async () => {
    const fetcher = vi.fn(function (this: unknown): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(response(activeSeries()));
    }) as unknown as typeof fetch;

    await expect(new MangaBakaApiClient({ fetcher }).getSeries(377)).resolves.toMatchObject({
      id: 377,
      titles: [{ title: "ONE PIECE" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("follows merged_with exactly once", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 10, state: "merged", merged_with: 20 }))
      .mockResolvedValueOnce(response(activeSeries(20)));

    await expect(new MangaBakaApiClient({ fetcher }).getSeries(10)).resolves.toMatchObject({
      requestedSeriesId: 10,
      id: 20,
      mergedFrom: 10,
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.mangabaka.org/v2/series/10?schema=full",
      "https://api.mangabaka.org/v2/series/20?schema=full",
    ]);
  });

  it("fails closed on merge loops and chains", async () => {
    const selfLoop = vi.fn<typeof fetch>().mockResolvedValue(response({ id: 10, state: "merged", merged_with: 10 }));
    await expect(new MangaBakaApiClient({ fetcher: selfLoop }).getSeries(10))
      .rejects.toMatchObject({ code: "merge_loop" });

    const chain = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 10, state: "merged", merged_with: 20 }))
      .mockResolvedValueOnce(response({ id: 20, state: "merged", merged_with: 30 }));
    await expect(new MangaBakaApiClient({ fetcher: chain }).getSeries(10))
      .rejects.toMatchObject({ code: "merge_depth_exceeded" });
  });

  it("rejects deleted series without a valid active target", async () => {
    const deleted = vi.fn<typeof fetch>().mockResolvedValue(response({
      id: 377,
      state: "deleted",
      merged_with: null,
    }));
    await expect(new MangaBakaApiClient({ fetcher: deleted }).getSeries(377))
      .rejects.toMatchObject({ code: "deleted_series" });

    const deletedTarget = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 10, state: "merged", merged_with: 20 }))
      .mockResolvedValueOnce(response({ id: 20, state: "deleted", merged_with: null }));
    await expect(new MangaBakaApiClient({ fetcher: deletedTarget }).getSeries(10))
      .rejects.toMatchObject({ code: "deleted_series" });
  });

  it.each([
    { ...activeSeries(), canonical_url: "https://mangabaka.org/manga/999/wrong" },
    { ...activeSeries(), authors: [123] },
    { ...activeSeries(), last_updated_at: "yesterday" },
    { ...activeSeries(), titles: [{ title: "broken" }] },
  ])("rejects an invalid full response contract", async (data) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(data));
    await expect(new MangaBakaApiClient({ fetcher }).getSeries(377))
      .rejects.toMatchObject({ code: "invalid_contract" });
  });

  it("rejects invalid ids before making a request", () => {
    expect(() => buildMangaBakaSeriesApiUrl(0)).toThrowError(MangaBakaApiError);
  });
});
