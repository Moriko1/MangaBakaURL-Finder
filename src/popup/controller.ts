import { parseMangaBakaSeriesUrl } from "../mangabaka/url";
import { matchProviderPage } from "../providers/registry";
import type { ProviderId, ProviderOutcome, ProviderPageType } from "../providers/types";
import { summarizeProviderOutcomes } from "./lookup-status";

export type PopupRouteDecision =
  | { kind: "mangabaka-series"; seriesId: number }
  | { kind: "provider-page"; providerId: ProviderId; pageType: ProviderPageType }
  | { kind: "unsupported"; reason: "missing-url" | "unrecognized-url" | "disabled-provider" };

export type PopupStatusTone = "idle" | "loading" | "success" | "error";

export type PopupPresentationState =
  | {
      kind: "lookup";
      enabledProviderIds: readonly ProviderId[];
      outcomes: Partial<Record<ProviderId, ProviderOutcome<unknown>>>;
      fromCache: boolean;
    }
  | { kind: "retry" }
  | { kind: "reset" };

export interface PopupStatusPresentation {
  message: string;
  tone: PopupStatusTone;
}

export function resolvePopupRoute(
  url: string,
  enabledProviders: Partial<Record<ProviderId, boolean>>,
): PopupRouteDecision {
  if (!url) {
    return { kind: "unsupported", reason: "missing-url" };
  }

  const providerOutcome = matchProviderPage(url);
  if (providerOutcome?.kind === "found") {
    return enabledProviders[providerOutcome.providerId] === true
      ? {
          kind: "provider-page",
          providerId: providerOutcome.providerId,
          pageType: providerOutcome.value.pageType,
        }
      : { kind: "unsupported", reason: "disabled-provider" };
  }

  const series = parseMangaBakaSeriesUrl(url);
  return series
    ? { kind: "mangabaka-series", seriesId: series.seriesId }
    : { kind: "unsupported", reason: "unrecognized-url" };
}

export function getPopupStatusPresentation(state: PopupPresentationState): PopupStatusPresentation {
  if (state.kind === "retry") {
    return { message: "Refreshing MangaBaka metadata...", tone: "loading" };
  }
  if (state.kind === "reset") {
    return { message: "Clearing cached search...", tone: "loading" };
  }
  if (state.enabledProviderIds.length === 0) {
    return { message: "No providers enabled", tone: "error" };
  }
  if (state.fromCache) {
    return { message: "Loaded cached result", tone: "success" };
  }

  const summary = summarizeProviderOutcomes(state.enabledProviderIds, state.outcomes);
  if (summary === "complete") {
    return { message: "Search complete", tone: "success" };
  }
  if (summary === "partial") {
    return { message: "Search completed with some provider issues", tone: "error" };
  }
  return { message: "Provider searches are temporarily unavailable", tone: "error" };
}
