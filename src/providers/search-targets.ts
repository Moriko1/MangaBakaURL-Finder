import {
  buildAdultManualSearchUrl,
  buildAtsumaruManualSearchUrl,
  buildMangaDexManualSearchUrl,
  buildMangaFireManualSearchUrl,
  buildWeebCentralManualSearchUrl,
} from "./manual-search";
import type { ProviderId } from "./types";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;

export type ProviderSearchTargetId = Exclude<ProviderId, "comixto">;

export interface ProviderSearchTarget {
  readonly providerId: ProviderSearchTargetId;
  readonly label: string;
  readonly buildSearchUrl: (title: string) => string;
  readonly contextMenuIcons: Readonly<Record<string, string>>;
}

const PUBLIC_PROVIDER_SEARCH_TARGETS: readonly ProviderSearchTarget[] = [
  {
    providerId: "atsu",
    label: "Atsumaru",
    buildSearchUrl: buildAtsumaruManualSearchUrl,
    contextMenuIcons: { "16": "assets/providers/atsu.ico", "32": "assets/providers/atsu.ico" },
  },
  {
    providerId: "mangadex",
    label: "MangaDex",
    buildSearchUrl: buildMangaDexManualSearchUrl,
    contextMenuIcons: { "16": "assets/providers/mangadex.ico", "32": "assets/providers/mangadex.ico" },
  },
  {
    providerId: "mangafire",
    label: "MangaFire",
    buildSearchUrl: buildMangaFireManualSearchUrl,
    contextMenuIcons: { "16": "assets/providers/mangafire.png", "32": "assets/providers/mangafire.png" },
  },
  {
    providerId: "weebcentral",
    label: "WeebCentral",
    buildSearchUrl: buildWeebCentralManualSearchUrl,
    contextMenuIcons: { "16": "assets/providers/weebcentral.ico", "32": "assets/providers/weebcentral.ico" },
  },
];

const ADULT_PROVIDER_SEARCH_TARGETS: readonly ProviderSearchTarget[] = __ADULT_PROVIDERS_ENABLED__
  ? [
      {
        providerId: "ehentai",
        label: "E-Hentai",
        buildSearchUrl: (title) => buildAdultManualSearchUrl("ehentai", title),
        contextMenuIcons: { "16": "assets/providers/ehentai.ico", "32": "assets/providers/ehentai.ico" },
      },
      {
        providerId: "exhentai",
        label: "ExHentai",
        buildSearchUrl: (title) => buildAdultManualSearchUrl("exhentai", title),
        contextMenuIcons: { "16": "assets/providers/ehentai.ico", "32": "assets/providers/ehentai.ico" },
      },
    ]
  : [];

export const PROVIDER_SEARCH_TARGETS: readonly ProviderSearchTarget[] = Object.freeze([
  ...PUBLIC_PROVIDER_SEARCH_TARGETS,
  ...ADULT_PROVIDER_SEARCH_TARGETS,
]);

const SEARCH_TARGET_BY_ID = new Map<ProviderSearchTargetId, ProviderSearchTarget>(
  PROVIDER_SEARCH_TARGETS.map((target) => [target.providerId, target]),
);

export function getProviderSearchTarget(providerId: ProviderSearchTargetId): ProviderSearchTarget | null {
  return SEARCH_TARGET_BY_ID.get(providerId) ?? null;
}
