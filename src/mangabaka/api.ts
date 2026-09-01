import { isMangaMediaType, MangaMediaType } from "../domain/media";
import { cleanTitleText, SeriesTitle } from "../domain/titles";
import { validateCanonicalMangaBakaSeriesUrl } from "./url";

export const MANGABAKA_API_ORIGIN = "https://api.mangabaka.org";

export type MangaBakaApiErrorCode =
  | "invalid_series_id"
  | "http_error"
  | "network_error"
  | "invalid_json"
  | "invalid_contract"
  | "deleted_series"
  | "merge_loop"
  | "merge_depth_exceeded";

export class MangaBakaApiError extends Error {
  readonly code: MangaBakaApiErrorCode;
  readonly status: number | null;

  constructor(code: MangaBakaApiErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "MangaBakaApiError";
    this.code = code;
    this.status = status;
  }
}

export interface MangaBakaSeries {
  requestedSeriesId: number;
  id: number;
  state: "active";
  mergedFrom: number | null;
  canonicalUrl: string;
  mediaType: MangaMediaType;
  titles: SeriesTitle[];
  authors: string[];
  apiLastUpdatedAt: string | null;
}

export interface MangaBakaApiClientOptions {
  fetcher?: typeof fetch;
}

interface SeriesIdentity {
  id: number;
  state: string;
  mergedWith: number | null;
}

interface ParsedSeriesData extends SeriesIdentity {
  canonicalUrl: string;
  mediaType: MangaMediaType;
  titles: SeriesTitle[];
  authors: string[];
  apiLastUpdatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function contractError(message: string): MangaBakaApiError {
  return new MangaBakaApiError("invalid_contract", `Invalid MangaBaka API response: ${message}`);
}

function parseSeriesIdentity(value: unknown): SeriesIdentity {
  if (!isRecord(value)) {
    throw contractError("series data is not an object");
  }
  if (!isPositiveSafeInteger(value.id)) {
    throw contractError("id must be a positive integer");
  }
  if (typeof value.state !== "string" || !value.state.trim()) {
    throw contractError("state must be a non-empty string");
  }
  if (value.merged_with !== null && !isPositiveSafeInteger(value.merged_with)) {
    throw contractError("merged_with must be null or a positive integer");
  }

  return {
    id: value.id,
    state: value.state,
    mergedWith: value.merged_with,
  };
}

function parseAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw contractError("authors must be an array");
  }

  const authors: string[] = [];
  for (const author of value) {
    if (typeof author !== "string" || !author.trim()) {
      throw contractError("authors must contain only non-empty strings");
    }
    authors.push(author.trim());
  }
  return authors;
}

function parseTitle(value: unknown): SeriesTitle | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.language !== "string" || !value.language.trim()) {
    return null;
  }
  if (typeof value.title !== "string" || !cleanTitleText(value.title)) {
    return null;
  }
  if (!Array.isArray(value.traits) || value.traits.some((trait) => typeof trait !== "string" || !trait.trim())) {
    return null;
  }
  if (value.note !== null && typeof value.note !== "string") {
    return null;
  }
  if (typeof value.is_primary !== "boolean") {
    return null;
  }

  return {
    language: value.language.trim(),
    traits: value.traits.map((trait) => trait.trim()),
    title: cleanTitleText(value.title),
    note: value.note,
    isPrimary: value.is_primary,
  };
}

function parseTitles(value: unknown): SeriesTitle[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw contractError("titles must be a non-empty array");
  }

  const titles = value.map(parseTitle).filter((title): title is SeriesTitle => title !== null);
  if (titles.length === 0) {
    throw contractError("titles must contain at least one valid title");
  }
  return titles;
}

function parseLastUpdatedAt(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw contractError("last_updated_at must be null or a valid UTC timestamp");
  }
  return value;
}

export function parseMangaBakaSeriesData(value: unknown): ParsedSeriesData {
  const identity = parseSeriesIdentity(value);
  if (!isRecord(value)) {
    throw contractError("series data is not an object");
  }
  if (identity.state !== "active" || identity.mergedWith !== null) {
    throw contractError("resolved series must be active and unmerged");
  }
  if (!isMangaMediaType(value.type)) {
    throw contractError("type is unsupported");
  }
  if (typeof value.canonical_url !== "string") {
    throw contractError("canonical_url must be a string");
  }

  const canonicalLocation = validateCanonicalMangaBakaSeriesUrl(
    value.canonical_url,
    identity.id,
    value.type,
  );
  if (!canonicalLocation) {
    throw contractError("canonical_url does not match the series identity");
  }

  return {
    ...identity,
    canonicalUrl: value.canonical_url,
    mediaType: value.type,
    titles: parseTitles(value.titles),
    authors: parseAuthors(value.authors),
    apiLastUpdatedAt: parseLastUpdatedAt(value.last_updated_at),
  };
}

function parseEnvelope(value: unknown, httpStatus: number): unknown {
  if (!isRecord(value) || value.status !== httpStatus || !("data" in value)) {
    throw contractError("envelope status/data is invalid");
  }
  return value.data;
}

export function buildMangaBakaSeriesApiUrl(seriesId: number): string {
  if (!isPositiveSafeInteger(seriesId)) {
    throw new MangaBakaApiError("invalid_series_id", "MangaBaka series id must be a positive integer.");
  }
  return `${MANGABAKA_API_ORIGIN}/v2/series/${seriesId}?schema=full`;
}

export class MangaBakaApiClient {
  private readonly fetcher: typeof fetch;

  constructor(options: MangaBakaApiClientOptions = {}) {
    const fetcher = options.fetcher ?? globalThis.fetch;
    this.fetcher = fetcher.bind(globalThis);
  }

  async getSeries(seriesId: number, signal?: AbortSignal): Promise<MangaBakaSeries> {
    if (!isPositiveSafeInteger(seriesId)) {
      throw new MangaBakaApiError("invalid_series_id", "MangaBaka series id must be a positive integer.");
    }

    const firstData = await this.requestSeries(seriesId, signal);
    const firstIdentity = parseSeriesIdentity(firstData);
    if (firstIdentity.id !== seriesId) {
      throw contractError("response id does not match the requested series");
    }
    if (firstIdentity.state === "deleted" && firstIdentity.mergedWith === null) {
      throw new MangaBakaApiError("deleted_series", "The MangaBaka series was deleted without a valid merge target.");
    }

    let resolvedData = firstData;
    let mergedFrom: number | null = null;
    if (firstIdentity.mergedWith !== null) {
      if (firstIdentity.mergedWith === firstIdentity.id) {
        throw new MangaBakaApiError("merge_loop", "MangaBaka returned a self-referential series merge.");
      }

      mergedFrom = firstIdentity.id;
      resolvedData = await this.requestSeries(firstIdentity.mergedWith, signal);
      const resolvedIdentity = parseSeriesIdentity(resolvedData);
      if (resolvedIdentity.id !== firstIdentity.mergedWith) {
        throw contractError("merged response id does not match merged_with");
      }
      if (resolvedIdentity.state === "deleted" && resolvedIdentity.mergedWith === null) {
        throw new MangaBakaApiError("deleted_series", "The merged MangaBaka series target was deleted.");
      }
      if (resolvedIdentity.mergedWith !== null) {
        throw new MangaBakaApiError(
          resolvedIdentity.mergedWith === resolvedIdentity.id || resolvedIdentity.mergedWith === mergedFrom
            ? "merge_loop"
            : "merge_depth_exceeded",
          "MangaBaka returned more than one series merge hop.",
        );
      }
    }

    const parsed = parseMangaBakaSeriesData(resolvedData);
    return {
      requestedSeriesId: seriesId,
      id: parsed.id,
      state: "active",
      mergedFrom,
      canonicalUrl: parsed.canonicalUrl,
      mediaType: parsed.mediaType,
      titles: parsed.titles,
      authors: parsed.authors,
      apiLastUpdatedAt: parsed.apiLastUpdatedAt,
    };
  }

  private async requestSeries(seriesId: number, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(buildMangaBakaSeriesApiUrl(seriesId), {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (error) {
      if (error instanceof MangaBakaApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Unknown network failure";
      throw new MangaBakaApiError("network_error", `MangaBaka request failed: ${message}`);
    }

    if (!response.ok) {
      throw new MangaBakaApiError(
        "http_error",
        `MangaBaka request failed (${response.status}).`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MangaBakaApiError("invalid_json", "MangaBaka returned invalid JSON.", response.status);
    }

    return parseEnvelope(payload, response.status);
  }
}
