import { ATSUMARU_ADAPTER } from "./atsumaru";
import { EHENTAI_ADAPTER, EXHENTAI_ADAPTER } from "./adult";
import { COMIX_ADAPTER } from "./comix";
import { MANGADEX_ADAPTER } from "./mangadex";
import { MANGAFIRE_ADAPTER } from "./mangafire";
import type { ProviderAdapter, ProviderId, ProviderOutcome, ProviderPageMatch } from "./types";
import { WEEBCENTRAL_ADAPTER } from "./weebcentral";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;

export const PROVIDER_ADAPTERS: readonly ProviderAdapter[] = Object.freeze([
  ATSUMARU_ADAPTER,
  MANGADEX_ADAPTER,
  WEEBCENTRAL_ADAPTER,
  MANGAFIRE_ADAPTER,
  ...(__ADULT_PROVIDERS_ENABLED__ ? [EHENTAI_ADAPTER, EXHENTAI_ADAPTER] : []),
  COMIX_ADAPTER,
]);

const ADAPTER_BY_ID = new Map<ProviderId, ProviderAdapter>(
  PROVIDER_ADAPTERS.map((adapter) => [adapter.id, adapter]),
);

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter | null {
  const adapter = ADAPTER_BY_ID.get(providerId);
  return adapter ?? null;
}

export function matchProviderPage(
  value: string,
  options: { includePlanned?: boolean } = {},
): ProviderOutcome<ProviderPageMatch> | null {
  for (const adapter of PROVIDER_ADAPTERS) {
    if (adapter.availability === "planned" && options.includePlanned !== true) {
      continue;
    }
    const outcome = adapter.matchPage(value);
    if (outcome.kind !== "no_match") {
      return outcome;
    }
  }
  return null;
}

export function getSelectableProviderAdapters(): readonly ProviderAdapter[] {
  return PROVIDER_ADAPTERS.filter((adapter) => adapter.availability !== "planned");
}
