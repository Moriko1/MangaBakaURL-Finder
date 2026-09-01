export type ProviderId =
  | "atsu"
  | "mangadex"
  | "mangafire"
  | "weebcentral"
  | "ehentai"
  | "exhentai"
  | "comixto";

export type ProviderAvailability = "enabled" | "optional" | "planned";
export type ProviderPageType = "series" | "chapter";
export type ProviderCredentialPolicy = "omit" | "include";
export type ProviderLiveTestPolicy = "safe_public" | "fixture_only";
export type ProviderUnavailableReason = "timeout" | "network" | "http" | "aborted";

interface ProviderOutcomeBase {
  providerId: ProviderId;
  url?: string;
  httpStatus?: number;
  message?: string;
}

export type ProviderOutcome<T> =
  | (ProviderOutcomeBase & { kind: "found"; value: T })
  | (ProviderOutcomeBase & { kind: "no_match" })
  | (ProviderOutcomeBase & { kind: "blocked" })
  | (ProviderOutcomeBase & { kind: "rate_limited"; retryAfterMs?: number })
  | (ProviderOutcomeBase & { kind: "auth_required" })
  | (ProviderOutcomeBase & { kind: "unavailable"; reason: ProviderUnavailableReason })
  | (ProviderOutcomeBase & {
      kind: "error";
      errorType: "invalid_response" | "provider";
    })
  | (ProviderOutcomeBase & { kind: "unsupported" });

export interface ProviderPageMatch {
  providerId: ProviderId;
  pageType: ProviderPageType;
  sourceUrl: string;
  canonicalUrl: string;
  seriesId: string | null;
  chapterId: string | null;
}

export interface ProviderSearchCandidate {
  providerId: ProviderId;
  title: string;
  url: string;
  aliases: string[];
  seriesId: string | null;
}

export interface ProviderSearchRequest {
  url: string;
  credentialPolicy: ProviderCredentialPolicy;
  headers?: Readonly<Record<string, string>>;
  forbiddenOutcome?: "blocked" | "auth_required";
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  readonly availability: ProviderAvailability;
  readonly enabledByDefault: boolean;
  readonly hostnames: readonly string[];
  readonly homepageUrl: string;
  readonly credentialPolicy: ProviderCredentialPolicy;
  readonly liveTestPolicy: ProviderLiveTestPolicy;
  matchPage(url: string): ProviderOutcome<ProviderPageMatch>;
  buildSearchRequest?(title: string): ProviderSearchRequest;
  parseSearchResponse?(body: string): ProviderOutcome<ProviderSearchCandidate[]>;
  buildManualSearchUrl?(title: string): string | null;
}

export function providerFound<T>(
  providerId: ProviderId,
  value: T,
  details: Omit<ProviderOutcomeBase, "providerId"> = {},
): ProviderOutcome<T> {
  return { kind: "found", providerId, value, ...details };
}

export function providerNoMatch<T>(
  providerId: ProviderId,
  details: Omit<ProviderOutcomeBase, "providerId"> = {},
): ProviderOutcome<T> {
  return { kind: "no_match", providerId, ...details };
}

export function providerInvalidResponse<T>(
  providerId: ProviderId,
  message: string,
  details: Omit<ProviderOutcomeBase, "providerId" | "message"> = {},
): ProviderOutcome<T> {
  return { kind: "error", errorType: "invalid_response", providerId, message, ...details };
}

export function providerUnsupported<T>(
  providerId: ProviderId,
  details: Omit<ProviderOutcomeBase, "providerId"> = {},
): ProviderOutcome<T> {
  return { kind: "unsupported", providerId, ...details };
}
