import type {
  ProviderId,
  ProviderOutcome,
  ProviderSearchCandidate,
  ProviderSearchRequest,
} from "./providers/types";
import { fetchProviderSearchRequest, fetchProviderText } from "./providers/fetch";
import { resolveStableProviderOutcome } from "./providers/cache";
import { buildMangaBakaManualSearchUrl } from "./providers/manual-search";
import { isStableProviderSearchOutcome, transitionProviderSearch } from "./providers/transition";
import {
  buildAtsumaruMangaPageRequest,
  parseAtsumaruLatestChapterResponse,
} from "./providers/atsumaru";
import {
  buildMangaDexChapterMetadataRequest,
  buildMangaDexChapterFeedRequest,
  buildMangaDexTitleMetadataRequest,
  classifyMangaDexChapterAvailability,
  parseMangaDexChapterSeriesResponse,
  parseMangaDexChapterFeedResponse,
  parseMangaDexSeriesTitlesResponse,
  parseMangaDexTitleMetadataResponse,
} from "./providers/mangadex";
import { pickMangaDexSearchCandidate } from "./providers/mangadex-matching";
import { getProviderAdapter, matchProviderPage as matchRegisteredProviderPage } from "./providers/registry";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;

import type {
  MangaBakaSeriesPageContext,
  ProviderPageContext as ActiveProviderPageContext,
} from "./domain/active-page";
import { resolveDisplayTitle, resolveSeriesTitles } from "./domain/titles";
import {
  createTitleFingerprint,
  getLookupCacheKey,
  isLookupCacheV12,
  LOOKUP_CACHE_PREFIX,
  LOOKUP_CACHE_SCHEMA_VERSION,
  MANGADEX_LOOKUP_REVISION,
  migrateLookupCacheStorage,
  refreshMangaDexCacheRevision,
  shouldInvalidateProviderResults,
  type CachedMangaBakaSeries,
  type LookupCacheV12,
} from "./lookup/cache";
import { MangaBakaApiClient, MangaBakaApiError, type MangaBakaSeries } from "./mangabaka/api";
import { parseMangaBakaSeriesUrl } from "./mangabaka/url";
import { PageContextClient } from "./popup/page-context-client";
import { getPopupStatusPresentation, resolvePopupRoute } from "./popup/controller";
import {
  DEFAULT_ENABLED_PROVIDERS,
  DEFAULT_PROVIDER_LABEL_MODE,
  DEFAULT_SETTINGS,
  isContextMenuLinkTypeEnabled,
  loadSettings,
  normalizeContextMenuLinkType,
  normalizeContextMenuMode,
  normalizeLinkTargetType,
  normalizeMangaBakaButtonTarget,
  saveSettings as persistSettings,
  type ExtensionSettings,
  type LinkTargetType,
  type OptionsPanelTab,
  type ProviderSettingKey,
} from "./settings";

declare const __BUILD_VARIANT__: "complete" | "google" | "firefox";

// noinspection JSUnusedGlobalSymbols
interface MangaBakaMetadata {
  seriesId: string;
  sourceUrl: string;
  primaryTitle: string;
  titles: string[];
  authors: string[];
  apiSeries: MangaBakaSeries;
}

interface ProviderMatch {
  provider: "Atsumaru" | "Comix" | "E-Hentai" | "ExHentai" | "MangaDex" | "MangaFire" | "WeebCentral";
  title: string;
  url: string;
  latestChapterNumber: string | null;
  latestChapterLanguage: "en" | null;
  manualPurgedChapterNumber?: string | null;
  mangaDexChapterState?: StoredMangaDexChapterState | null;
  manualMangaDexChapterState?: StoredMangaDexChapterState | null;
}

interface LookupResults {
  atsu: ProviderMatch | null;
  mangadex: ProviderMatch | null;
  ehentai: ProviderMatch | null;
  exhentai: ProviderMatch | null;
  comixto: ProviderMatch | null;
  mangafire: ProviderMatch | null;
  weebcentral: ProviderMatch | null;
}

interface RejectedProviderUrls {
  atsu: string[];
  mangadex: string[];
  ehentai: string[];
  exhentai: string[];
  comixto: string[];
  mangafire: string[];
  weebcentral: string[];
}

interface CachedLookup {
  schemaVersion: 12;
  series: CachedMangaBakaSeries;
  providers: Record<string, unknown>;
  results: LookupResults;
  rejectedUrls: RejectedProviderUrls;
  titleAttemptIndexes: Record<ProviderKey, number>;
  searchedProviders: Record<ProviderKey, boolean>;
  searchedAt: string;
}

interface AtsuSearchResponse {
  hits?: Array<{
    document?: {
      id?: string;
      title?: string;
      otherNames?: string[];
      hidden?: boolean;
    };
  }>;
}

interface AtsuMangaPageResponse {
  mangaPage?: {
    chapters?: Array<{
      title?: string | null;
      number?: number | string | null;
      createdAt?: number;
      index?: number;
    }>;
  };
}

interface MangaDexResponse {
  data?: Array<{
    id: string;
    attributes?: {
      title?: Record<string, string>;
      altTitles?: Array<Record<string, string>>;
    };
  }>;
}

interface MangaDexFeedResponse {
  data?: Array<{
    attributes?: {
      chapter?: string | null;
      translatedLanguage?: string | null;
    };
  }>;
}

interface MangaDexMangaResponse {
  data?: {
    attributes?: {
      availableTranslatedLanguages?: string[] | null;
      latestUploadedChapter?: string | null;
    };
  };
}

interface ExtractedMetadataPayload {
  titles: string[];
  authors: string[];
}

interface SearchResultEntry {
  url: string;
  title: string;
  cite: string;
}

interface EHentaiSearchResult {
  url: string;
  title: string;
}

type ProviderKey = ProviderSettingKey;
type MangaDexChapterState = "available" | "purged" | "no_chapters_tld";
type StoredMangaDexChapterState = MangaDexChapterState;
type MangaDexStatusIconKey = "slight-smile" | "melting-face" | "clown-face" | "pensive";
type StatusTone = "idle" | "loading" | "success" | "error";
type PopupViewState = "unsupported" | "invalid" | "loading" | "lookup" | "provider" | "error";
type ProviderSearchOutcome = ProviderOutcome<ProviderMatch>;

type ProviderPageContext = ActiveProviderPageContext<ProviderKey, ProviderMatch["provider"]>;

interface PendingConfirmation {
  button: HTMLButtonElement;
  messages: string[];
  messageIndex: number;
  action: () => Promise<void> | void;
  activeClassName: string;
  timeoutId: number;
}

type InstallSourceKind = "local" | "google" | "firefox";

interface InstallSourceInfo {
  kind: InstallSourceKind;
  label: string;
  url: string | null;
}

interface ReleaseUpdateInfo {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTagName: string | null;
  latestReleaseUrl: string;
  status: "up_to_date" | "update_available";
}

interface MangaDexPurgeStats {
  purgedCount: number;
  totalCount: number;
}

interface CacheSeriesStats {
  seriesCount: number;
  totalBytes: number;
}

class InvalidMangaBakaPageError extends Error {
  constructor() {
    super("Invalid MangaBaka page.");
    this.name = "InvalidMangaBakaPageError";
  }
}

const CACHE_VERSION = LOOKUP_CACHE_SCHEMA_VERSION;
const POPUP_RELEASE_UPDATE_STORAGE_KEY = "extension:release-update";
const LOCAL_INSTALL_SOURCE_URL = "https://github.com/Moriko1/MangaBakaURL-Finder/releases/latest";
const GOOGLE_INSTALL_SOURCE_URL = "https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb";
const PROVIDER_KEYS: ProviderKey[] = [
  "atsu",
  "mangadex",
  "comixto",
  "mangafire",
  "weebcentral",
  ...(__ADULT_PROVIDERS_ENABLED__ ? ["ehentai", "exhentai"] as ProviderKey[] : []),
];
const PROVIDERS: Array<{ key: ProviderKey; label: ProviderMatch["provider"] }> = [
  { key: "atsu", label: "Atsumaru" },
  { key: "mangadex", label: "MangaDex" },
  { key: "comixto", label: "Comix" },
  { key: "mangafire", label: "MangaFire" },
  { key: "weebcentral", label: "WeebCentral" },
  ...(__ADULT_PROVIDERS_ENABLED__
    ? [
        { key: "ehentai" as const, label: "E-Hentai" as const },
        { key: "exhentai" as const, label: "ExHentai" as const },
      ]
    : []),
];
const PROVIDER_LABELS: Record<ProviderKey, ProviderMatch["provider"]> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.key, provider.label]),
) as Record<ProviderKey, ProviderMatch["provider"]>;
const VISIBLE_PROVIDER_KEYS: ProviderKey[] = [
  "atsu",
  "mangadex",
  "mangafire",
  "weebcentral",
  ...(__ADULT_PROVIDERS_ENABLED__ ? ["ehentai", "exhentai"] as ProviderKey[] : []),
];
const PROVIDER_ICON_EXTENSIONS: Record<ProviderKey, string> = {
  atsu: "ico",
  mangadex: "ico",
  comixto: "ico",
  mangafire: "png",
  weebcentral: "ico",
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: "ico", exhentai: "ico" } : {}),
} as Record<ProviderKey, string>;
const EMPTY_LOOKUP_RESULTS: LookupResults = {
  atsu: null,
  mangadex: null,
  comixto: null,
  mangafire: null,
  weebcentral: null,
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: null, exhentai: null } : {}),
} as LookupResults;
const EMPTY_REJECTED_PROVIDER_URLS: RejectedProviderUrls = {
  atsu: [],
  mangadex: [],
  comixto: [],
  mangafire: [],
  weebcentral: [],
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: [], exhentai: [] } : {}),
} as RejectedProviderUrls;
const EMPTY_TITLE_ATTEMPT_INDEXES: Record<ProviderKey, number> = {
  atsu: 0,
  mangadex: 0,
  comixto: 0,
  mangafire: 0,
  weebcentral: 0,
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: 0, exhentai: 0 } : {}),
} as Record<ProviderKey, number>;
const EXTENSION_MANIFEST = chrome.runtime.getManifest();
const EXTENSION_VERSION_NAME = EXTENSION_MANIFEST.version_name ?? EXTENSION_MANIFEST.version;
const EXTENSION_BUILD_DATE = (globalThis as typeof globalThis & { BUILD_DATE?: string }).BUILD_DATE ?? "Unknown";

const COPY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2"></rect>
    <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path>
  </svg>
`;

const MANGABAKA_GLOBE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M3 12h18"></path>
    <path d="M12 3a14 14 0 0 1 0 18"></path>
    <path d="M12 3a14 14 0 0 0 0 18"></path>
  </svg>
`;

const MANGABAKA_GLOBE_NEW_TAB_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="13.5" r="7.5"></circle>
    <path d="M3 13.5h15"></path>
    <path d="M10.5 6a11.5 11.5 0 0 1 0 15"></path>
    <path d="M10.5 6a11.5 11.5 0 0 0 0 15"></path>
    <path d="M14.5 4h6v6"></path>
    <path d="M20.5 4l-6 6"></path>
  </svg>
`;

const OPEN_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 5h5v5"></path>
    <path d="M10 14 19 5"></path>
    <path d="M19 14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3"></path>
  </svg>
`;

const RESET_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66"></path>
    <path d="M20 4v6h-6"></path>
  </svg>
`;

const RETRY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14"></path>
    <path d="m13 6 6 6-6 6"></path>
  </svg>
`;

const SAVE_READ_LINK_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11"></path>
    <path d="m7 10 5 5 5-5"></path>
    <path d="M5 20h14"></path>
  </svg>
`;

const ENGLISH_FLAG_ICON = `
  <svg viewBox="0 0 36 36" class="provider-value-flag-icon" aria-hidden="true">
    <path d="M35.445 7C34.752 5.809 33.477 5 32 5H18v2h17.445zM0 25h36v2H0zm18-8h18v2H18zm0-4h18v2H18zM0 21h36v2H0zm4 10h28c1.477 0 2.752-.809 3.445-2H.555c.693 1.191 1.968 2 3.445 2zM18 9h18v2H18z" fill="#B22334"></path>
    <path d="M.068 27.679c.017.093.036.186.059.277.026.101.058.198.092.296.089.259.197.509.333.743L.555 29h34.89l.002-.004c.135-.233.243-.483.332-.741.034-.099.067-.198.093-.301.023-.09.042-.182.059-.275.041-.22.069-.446.069-.679H0c0 .233.028.458.068.679zM0 23h36v2H0zm0-4v2h36v-2H18zm18-4h18v2H18zm0-4h18v2H18zM0 9c0-.233.03-.457.068-.679C.028 8.542 0 8.767 0 9zm.555-2l-.003.005L.555 7zM.128 8.044c.025-.102.06-.199.092-.297-.034.098-.066.196-.092.297zM18 9h18c0-.233-.028-.459-.069-.68-.017-.092-.035-.184-.059-.274-.027-.103-.059-.203-.094-.302-.089-.258-.197-.507-.332-.74.001-.001 0-.003-.001-.004H18v2z" fill="#EEE"></path>
    <path d="M18 5H4C1.791 5 0 6.791 0 9v10h18V5z" fill="#3C3B6E"></path>
    <path d="m2.001 7.726.618.449-.236.725L3 8.452l.618.448-.236-.725L4 7.726h-.764L3 7l-.235.726zm2 2 .618.449-.236.725.617-.448.618.448-.236-.725L6 9.726h-.764L5 9l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L9 9l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L13 9l-.235.726zm-8 4 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L5 13l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L9 13l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L13 13l-.235.726zm-6-6 .618.449-.236.725L7 8.452l.618.448-.236-.725L8 7.726h-.764L7 7l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L11 7l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L15 7l-.235.726zm-12 4 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L3 11l-.235.726zM6.383 12.9 7 12.452l.618.448-.236-.725.618-.449h-.764L7 11l-.235.726h-.764l.618.449zm3.618-1.174.618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L11 11l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L15 11l-.235.726zm-12 4 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L3 15l-.235.726zM6.383 16.9 7 16.452l.618.448-.236-.725.618-.449h-.764L7 15l-.235.726h-.764l.618.449zm3.618-1.174.618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L11 15l-.235.726zm4 0 .618.449-.236.725.617-.448.618.448-.236-.725.618-.449h-.764L15 15l-.235.726z" fill="#FFF"></path>
  </svg>
`;

const MANGADEX_STATUS_ICON_MARKUP: Record<MangaDexStatusIconKey, string> = {
  "slight-smile": `
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill="#FFCC4D"></circle>
      <path d="M10.515 23.621C10.56 23.8 11.683 28 18 28c6.318 0 7.44-4.2 7.485-4.379.055-.217-.043-.442-.237-.554-.195-.111-.439-.078-.6.077C24.629 23.163 22.694 25 18 25s-6.63-1.837-6.648-1.855C11.256 23.05 11.128 23 11 23c-.084 0-.169.021-.246.064-.196.112-.294.339-.239.557z" fill="#664500"></path>
      <ellipse cx="12" cy="13.5" rx="2.5" ry="3.5" fill="#664500"></ellipse>
      <ellipse cx="24" cy="13.5" rx="2.5" ry="3.5" fill="#664500"></ellipse>
    </svg>
  `,
  "melting-face": `
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <path d="M35.07 32.558a1.92 1.92 0 0 0 .836-2.241c-.259-.81-1.07-1.317-1.921-1.317H32a1 1 0 0 1 0-2h1.5a1.5 1.5 0 1 0-.04-3c-.8.021-1.46-.623-1.46-1.423v-.003c0-.293.06-.578.176-.847a15.294 15.294 0 0 0 1.294-7.191C32.978 6.66 26.411.269 18.524.009 9.724-.281 2.5 6.766 2.5 15.5c0 2.371.548 4.609 1.5 6.619v1.88c0 1.086-.865 2.021-1.951 2a2 2 0 0 0-2.034 2.167C.101 29.225 1.069 30 2.133 30h8.039A1.17 1.17 0 0 1 11 32l-3.03.757a1.281 1.281 0 0 0 0 2.485c1.932.483 3.914.737 5.905.756l2.712.026c1.406.014 2.803-.31 4.029-1a8.289 8.289 0 0 1 5.642-.913c3.028.588 6.167.034 8.812-1.553z" fill="#FFCC4D"></path>
      <path d="M18.736 24.003c-.754 0-1.504-.078-2.244-.234-2.693-.571-5.003-2.115-6.338-4.236a1 1 0 0 1 1.692-1.066c1.033 1.642 2.925 2.892 5.06 3.345 1.767.375 4.507.393 7.536-1.642a1 1 0 0 1 1.116 1.66c-2.129 1.43-4.489 2.173-6.822 2.173z" fill="#65471B"></path>
      <ellipse cx="14" cy="12" rx="2" ry="3" fill="#65471B"></ellipse>
      <ellipse cx="23" cy="14" rx="2" ry="3" fill="#65471B"></ellipse>
    </svg>
  `,
  "clown-face": `
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="29" cy="3" r="2" fill="#4289C1"></circle>
      <circle cx="33" cy="8" r="3" fill="#4289C1"></circle>
      <circle cx="33" cy="4" r="3" fill="#4289C1"></circle>
      <circle cx="7" cy="3" r="2" fill="#4289C1"></circle>
      <circle cx="3" cy="8" r="3" fill="#4289C1"></circle>
      <circle cx="3" cy="4" r="3" fill="#4289C1"></circle>
      <path d="M36 18c0 9.941-8.059 18-18 18S0 27.941 0 18 8.059 0 18 0s18 8.059 18 18" fill="#FEE7B8"></path>
      <circle cx="30.5" cy="4.5" r="2.5" fill="#4289C1"></circle>
      <circle cx="32" cy="7" r="2" fill="#4289C1"></circle>
      <circle cx="5.5" cy="4.5" r="2.5" fill="#4289C1"></circle>
      <circle cx="4" cy="7" r="2" fill="#4289C1"></circle>
      <circle cx="6.93" cy="21" r="4" fill="#FF7892"></circle>
      <circle cx="28.93" cy="21" r="4" fill="#FF7892"></circle>
      <path d="M27.335 23.629c-.178-.161-.444-.171-.635-.029-.039.029-3.922 2.9-8.7 2.9-4.766 0-8.662-2.871-8.7-2.9-.191-.142-.457-.13-.635.029-.177.16-.217.424-.094.628C8.7 24.472 11.788 31 18 31s9.301-6.528 9.429-6.743c.123-.205.084-.468-.094-.628z" fill="#DA2F47"></path>
      <ellipse cx="11.5" cy="11.5" rx="2.5" ry="3.5" fill="#664500"></ellipse>
      <ellipse cx="25.5" cy="11.5" rx="2.5" ry="3.5" fill="#664500"></ellipse>
      <circle cx="18.5" cy="19.5" r="3.5" fill="#BB1A34"></circle>
    </svg>
  `,
  pensive: `
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <path d="M36 18c0 9.941-8.059 18-18 18-9.94 0-18-8.059-18-18C0 8.06 8.06 0 18 0c9.941 0 18 8.06 18 18" fill="#FFCC4D"></path>
      <path d="M17.312 17.612c-.176-.143-.427-.147-.61-.014-.012.009-1.26.902-3.702.902-2.441 0-3.69-.893-3.7-.9-.183-.137-.435-.133-.611.009-.178.142-.238.386-.146.594.06.135 1.5 3.297 4.457 3.297 2.958 0 4.397-3.162 4.457-3.297.092-.207.032-.449-.145-.591zm10 0c-.176-.143-.426-.148-.61-.014-.012.009-1.261.902-3.702.902-2.44 0-3.69-.893-3.7-.9-.183-.137-.434-.133-.611.009-.178.142-.238.386-.146.594.06.135 1.5 3.297 4.457 3.297 2.958 0 4.397-3.162 4.457-3.297.092-.207.032-.449-.145-.591zM22 28h-8c-.552 0-1-.447-1-1s.448-1 1-1h8c.553 0 1 .447 1 1s-.447 1-1 1zM6 14c-.552 0-1-.448-1-1 0-.551.445-.998.996-1 .156-.002 3.569-.086 6.205-3.6.331-.44.957-.532 1.4-.2.442.331.531.958.2 1.4C10.538 13.95 6.184 14 6 14zm24 0c-.184 0-4.537-.05-7.8-4.4-.332-.442-.242-1.069.2-1.4.441-.333 1.067-.242 1.399.2 2.641 3.521 6.061 3.599 6.206 3.6.55.006.994.456.991 1.005-.002.551-.446.995-.996.995z" fill="#664500"></path>
    </svg>
  `,
};

const INCORRECT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6 18 18"></path>
    <path d="M18 6 6 18"></path>
  </svg>
`;

let currentSourceUrl = "";
let currentTabId: number | null = null;
let currentCache: CachedLookup | null = null;
let currentPageContext: MangaBakaSeriesPageContext | null = null;
let currentPageContextClient: PageContextClient | null = null;
let currentPageContextClientPromise: Promise<PageContextClient> | null = null;
let currentPageContextTabId: number | null = null;
let currentCachedResultFlags: Partial<Record<ProviderKey, boolean>> = {};
let currentProviderSearchOutcomes: Partial<Record<ProviderKey, ProviderSearchOutcome>> = {};
let pendingConfirmation: PendingConfirmation | null = null;
let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
let retryCountdowns: Partial<Record<ProviderKey, number>> = {};
let retryInProgress: Partial<Record<ProviderKey, boolean>> = {};
let armedReadLinkSaves: Partial<Record<ProviderKey, string>> = {};
let readLinkSaveInProgress: ProviderKey | null = null;
let currentViewState: PopupViewState = "loading";
let currentErrorMessage = "Search failed.";
let currentProviderPage: ProviderPageContext | null = null;
let currentInactiveTitleMarkup = '<span class="brand-white">Manga</span> <span class="brand-red">Baka</span>';
let currentCacheSeriesStats: CacheSeriesStats = { seriesCount: 0, totalBytes: 0 };
let currentCacheSeriesStatFormat: "count" | "size" = "count";
let currentMangaDexPurgeStats: MangaDexPurgeStats = { purgedCount: 0, totalCount: 0 };
let currentMangaDexPurgeStatFormat: "percent" | "fraction" = "percent";
let currentVersionInfoMode: "version" | "releaseDate" = "version";
let currentReleaseUpdateInfo: ReleaseUpdateInfo | null = null;
let hasLoadedInfoPanelStats = false;
let infoPanelStatsRefreshPromise: Promise<void> | null = null;
let infoPanelStatsRevision = 0;
let inactiveTitleMarkupPromise: Promise<string> | null = null;
let settingsWriteQueue: Promise<void> = Promise.resolve();
let cacheStorageWriteQueue: Promise<void> = Promise.resolve();
let providerActionQueue: Promise<void> = Promise.resolve();
let providerActionsInProgress: Partial<Record<ProviderKey, boolean>> = {};
let nextLookupGeneration = 0;
let activeLookupGeneration = 0;
let metadataRefreshInProgress = false;
let isExtensionResetting = false;
let profileNameSaveTimer: number | null = null;
const RETRY_COOLDOWN_SECONDS = 2;
const PROFILE_NAME_SAVE_DELAY_MS = 250;

function beginLookupGeneration(): number {
  activeLookupGeneration = ++nextLookupGeneration;
  return activeLookupGeneration;
}

function invalidateLookupGeneration(): number {
  activeLookupGeneration = ++nextLookupGeneration;
  return activeLookupGeneration;
}

function isCurrentLookupGeneration(generation: number): boolean {
  return generation === activeLookupGeneration;
}

async function queueProviderAction(
  providerKey: ProviderKey,
  action: (generation: number) => Promise<void>,
): Promise<void> {
  if (providerActionsInProgress[providerKey]) {
    return;
  }

  const generation = activeLookupGeneration;
  providerActionsInProgress[providerKey] = true;
  rerenderCurrentResultsOnly();

  try {
    await queueCacheMutation(async () => {
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      await action(generation);
    });
  } finally {
    delete providerActionsInProgress[providerKey];
    if (currentViewState === "lookup") {
      rerenderCurrentResultsOnly();
    }
  }
}

async function queueCacheMutation(action: () => Promise<void>): Promise<void> {
  const queuedAction = providerActionQueue.catch(() => undefined).then(async () => {
    await action();
  });
  providerActionQueue = queuedAction.catch(() => undefined);
  await queuedAction;
}

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup().catch((error: unknown) => {
    const message = getPopupErrorMessage(error, "Unable to initialize the extension popup.");
    try {
      renderErrorState(message);
    } catch {
      // The popup document may have been closed while initialization was pending.
    }
  });
});

function getPopupErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallbackMessage;
}

function runPopupTask(
  task: () => Promise<void> | void,
  fallbackMessage = "Unable to complete that action.",
): void {
  void Promise.resolve()
    .then(task)
    .catch((error: unknown) => {
      try {
        setStatus(getPopupErrorMessage(error, fallbackMessage), "error");
      } catch {
        // The popup may have closed before the browser API operation settled.
      }
    });
}

// noinspection JSDeprecatedSymbols
chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
  if (areaName !== "local" || !(POPUP_RELEASE_UPDATE_STORAGE_KEY in changes)) {
    return;
  }

  const nextReleaseUpdateInfo = changes[POPUP_RELEASE_UPDATE_STORAGE_KEY]?.newValue;
  currentReleaseUpdateInfo = isReleaseUpdateInfo(nextReleaseUpdateInfo)
    ? nextReleaseUpdateInfo
    : null;
  renderInfoPanel();
});

async function initializePopup(): Promise<void> {
  setResetEnabled(false);
  setStatus("Checking the current tab...", "idle");
  const [settings, activeTab] = await Promise.all([
    loadSettings(),
    getActiveTab(),
    migrateLookupCacheStorage(chrome.storage.local),
  ]);
  currentSettings = settings;
  wireOptionsControls();
  renderOptionsPanel();

  currentTabId = typeof activeTab?.id === "number" ? activeTab.id : null;
  currentSourceUrl = activeTab?.url ?? "";
  void syncActionIcon();

  const route = resolvePopupRoute(currentSourceUrl, currentSettings.enabledProviders);
  if (route.kind === "provider-page") {
    const providerPageContext = await getProviderPageContext(currentSourceUrl);
    if (!providerPageContext) {
      currentCache = null;
      currentCachedResultFlags = {};
      await renderUnsupportedState();
      return;
    }
    currentCache = null;
    currentCachedResultFlags = {};
    currentProviderPage = providerPageContext;
    await renderProviderPageState(providerPageContext);
    return;
  }

  currentProviderPage = null;
  if (route.kind === "unsupported") {
    currentCache = null;
    currentCachedResultFlags = {};
    await renderUnsupportedState();
    return;
  }

  const seriesId = route.seriesId.toString();
  if (currentTabId != null) {
    const tabId = currentTabId;
    // The bridge supplies a preferred display title and Read Link support. A slow
    // page must not hold up cached results or the independent metadata API.
    void getPageContextClient(tabId).then((client) => {
      if (currentTabId !== tabId) return;
      const context = client.getLastContext();
      currentPageContext = context?.seriesId === route.seriesId ? context : null;
      if (currentCache && currentViewState === "lookup") {
        getTitleNode().textContent = resolveCachedDisplayTitle(currentCache);
      }
    }).catch(() => undefined);
  }

  setResetEnabled(true);
  wireTopResetButton(seriesId);

  const cachedLookup = await loadCache(seriesId);
  if (cachedLookup) {
    currentCache = cachedLookup;
    currentCachedResultFlags = buildCachedResultFlags(cachedLookup.results, true);
    metadataRefreshInProgress = true;
    renderLookup(cachedLookup, true);
    const generation = beginLookupGeneration();

    try {
      const refreshedMetadata = await fetchMangaBakaMetadata(currentSourceUrl, seriesId);
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      if (shouldInvalidateProviderResults(cachedLookup.series, refreshedMetadata.apiSeries.titles)) {
        await queueCacheMutation(async () => {
          if (isCurrentLookupGeneration(generation)) {
            await persistMetadataOnlyInvalidation(refreshedMetadata);
          }
        });
        if (!isCurrentLookupGeneration(generation)) {
          return;
        }
        metadataRefreshInProgress = false;
        await runLookup(
          refreshedMetadata.sourceUrl,
          seriesId,
          createEmptyRejectedProviderUrls(),
          { ...EMPTY_TITLE_ATTEMPT_INDEXES },
          refreshedMetadata,
        );
        return;
      }

      await queueCacheMutation(async () => {
        if (!isCurrentLookupGeneration(generation) || !currentCache) {
          return;
        }
        await refreshPendingMangaDexLookup(refreshedMetadata, generation);
        if (!isCurrentLookupGeneration(generation) || !currentCache) {
          return;
        }
        const refreshedCache: CachedLookup = {
          ...currentCache,
          series: createCachedSeries(refreshedMetadata),
        };
        await saveCache(refreshedCache);
        if (isCurrentLookupGeneration(generation)) {
          currentCache = refreshedCache;
        }
      });
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      metadataRefreshInProgress = false;
      if (currentCache) {
        renderLookup(currentCache, true);
      }
    } catch (error) {
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      if (error instanceof InvalidMangaBakaPageError) {
        await queueCacheMutation(async () => {
          if (!isCurrentLookupGeneration(generation)) {
            return;
          }
          await clearCache(seriesId);
          if (isCurrentLookupGeneration(generation)) {
            currentCache = null;
          }
        });
        if (!isCurrentLookupGeneration(generation)) {
          return;
        }
        metadataRefreshInProgress = false;
        await renderInvalidPageState();
        return;
      }
      metadataRefreshInProgress = false;
      if (currentCache) {
        renderLookup(currentCache, true);
      }
      setStatus("Loaded cached API metadata; MangaBaka refresh failed. Retry is available.", "error");
      wireCachedMetadataRetryButton(seriesId);
    } finally {
      if (isCurrentLookupGeneration(generation) && metadataRefreshInProgress) {
        metadataRefreshInProgress = false;
        if (currentViewState === "lookup") {
          rerenderCurrentResultsOnly();
        }
      }
    }
    return;
  }

  await runLookup(
    currentSourceUrl,
    seriesId,
    createEmptyRejectedProviderUrls(),
    { ...EMPTY_TITLE_ATTEMPT_INDEXES },
  );
}

async function getActiveTab(): Promise<{ id?: number; url?: string; title?: string } | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function getPageContextClient(tabId: number): Promise<PageContextClient> {
  if (currentPageContextTabId === tabId) {
    if (currentPageContextClient && !currentPageContextClient.isDisconnected()) {
      return currentPageContextClient;
    }
    if (currentPageContextClientPromise) return currentPageContextClientPromise;
  }

  currentPageContextClient?.disconnect();
  currentPageContextClient = null;
  currentPageContext = null;
  currentPageContextTabId = tabId;
  const connection = PageContextClient.connect(tabId);
  currentPageContextClientPromise = connection;
  try {
    const client = await connection;
    if (currentPageContextClientPromise !== connection) {
      client.disconnect();
      throw new Error("The active MangaBaka tab changed while connecting.");
    }
    currentPageContextClient = client;
    return client;
  } finally {
    if (currentPageContextClientPromise === connection) {
      currentPageContextClientPromise = null;
    }
  }
}

function isPopupMissingTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id|Tabs cannot be edited right now|tab was closed/i.test(error.message);
}

async function resolveUsableTabId(): Promise<number | null> {
  if (currentTabId != null) {
    try {
      const currentTab = await chrome.tabs.get(currentTabId);
      currentSourceUrl = currentTab.url ?? currentSourceUrl;
      return currentTabId;
    } catch (error) {
      if (!isPopupMissingTabError(error)) {
        throw error;
      }

      currentTabId = null;
    }
  }

  const activeTab = await getActiveTab();
  const activeTabId = typeof activeTab?.id === "number" ? activeTab.id : null;
  currentTabId = activeTabId;
  currentSourceUrl = activeTab?.url ?? currentSourceUrl;
  return activeTabId;
}

async function syncActionIcon(): Promise<void> {
  if (currentTabId == null) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      protocolVersion: 1,
      type: "action:sync",
      tabId: currentTabId,
      url: currentSourceUrl,
    });
  } catch {
    return;
  }
}

function requestReleaseUpdateStatus(): void {
  if (getInstallSourceInfo().kind !== "local") {
    return;
  }

  void (async () => {
    try {
      await chrome.runtime.sendMessage({
        protocolVersion: 1,
        type: "release:ensure",
      });
    } catch {
      return;
    }
  })();
}

function isReleaseUpdateInfo(value: unknown): value is ReleaseUpdateInfo {
  if (!value || typeof value !== "object") {
    return false;
  }

  const releaseInfo = value as Record<string, unknown>;
  return (
    typeof releaseInfo.checkedAt === "string"
    && typeof releaseInfo.currentVersion === "string"
    && typeof releaseInfo.latestReleaseUrl === "string"
    && (releaseInfo.latestVersion == null || typeof releaseInfo.latestVersion === "string")
    && (releaseInfo.latestTagName == null || typeof releaseInfo.latestTagName === "string")
    && (releaseInfo.status === "up_to_date" || releaseInfo.status === "update_available")
  );
}

function formatLatestReleaseLabel(value: string | null): string {
  if (!value) {
    return "Update";
  }

  return value.startsWith("v") ? value : `v${value}`;
}

function setInfoPanelLinkState(node: HTMLAnchorElement, label: string, url: string | null): void {
  node.textContent = label;
  if (url) {
    node.href = url;
    node.setAttribute("aria-disabled", "false");
    node.tabIndex = 0;
    return;
  }

  node.removeAttribute("href");
  node.setAttribute("aria-disabled", "true");
  node.tabIndex = -1;
}

function createLegacyMangaBakaMetadata(
  seriesId: string,
  sourceUrl: string,
  extractedMetadata: ExtractedMetadataPayload,
): Omit<MangaBakaMetadata, "apiSeries"> {
  return {
    seriesId,
    sourceUrl,
    primaryTitle: pickPreferredTitle(extractedMetadata.titles),
    titles: extractedMetadata.titles,
    authors: extractedMetadata.authors,
  };
}

function extractMangaBakaPreviewTitle(tabTitle?: string): string | null {
  if (typeof tabTitle !== "string") {
    return null;
  }

  const cleanedTitle = tabTitle.replace(/\s+manga information$/i, "").trim();
  if (!cleanedTitle) {
    return null;
  }

  const match = cleanedTitle.match(/^(.+?)\s*\((.+)\)$/);
  return (match?.[1] ?? cleanedTitle).trim() || null;
}

function renderMangaBakaHeader(title: string, authors: string[]): void {
  getTitleNode().classList.remove("title--inactive");
  getTitleNode().textContent = title;
  getSubtitleNode().textContent = authors[0] ? `by ${authors[0]}` : "Loading series details...";
}

function refreshInfoPanelStatsIfNeeded(force = false): Promise<void> {
  if (!force && hasLoadedInfoPanelStats) {
    return Promise.resolve();
  }

  infoPanelStatsRefreshPromise ??= refreshInfoPanelStats().then(
    () => {
      infoPanelStatsRefreshPromise = null;
      if (
        !hasLoadedInfoPanelStats
        && isOptionsPanelOpen()
        && currentSettings.optionsPanelTab === "info"
      ) {
        runPopupTask(
          () => refreshInfoPanelStatsIfNeeded(),
          "Unable to refresh extension information.",
        );
      }
    },
    (error: unknown) => {
      infoPanelStatsRefreshPromise = null;
      throw error;
    },
  );
  return infoPanelStatsRefreshPromise;
}

function invalidateInfoPanelStats(): void {
  infoPanelStatsRevision += 1;
  hasLoadedInfoPanelStats = false;
  if (isOptionsPanelOpen() && currentSettings.optionsPanelTab === "info") {
    runPopupTask(
      () => refreshInfoPanelStatsIfNeeded(),
      "Unable to refresh extension information.",
    );
  }
}

function isMangabakaSeriesUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === "mangabaka.org" && /^\/\d+\/?$/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function getSeriesIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/^\/(\d+)\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getCacheKey(seriesId: string): string {
  return getLookupCacheKey(seriesId);
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  if (isExtensionResetting) {
    return;
  }
  const write = settingsWriteQueue
    .catch(() => undefined)
    .then(() => persistSettings(settings));
  settingsWriteQueue = write;
  await write;
}

function queueProfileNameSave(): void {
  if (isExtensionResetting) {
    return;
  }
  if (profileNameSaveTimer != null) {
    window.clearTimeout(profileNameSaveTimer);
  }

  profileNameSaveTimer = window.setTimeout(() => {
    profileNameSaveTimer = null;
    runPopupTask(
      () => saveSettings(currentSettings),
      "Unable to save the MangaBaka profile name.",
    );
  }, PROFILE_NAME_SAVE_DELAY_MS);
}

function wireOptionsControls(): void {
  getMangaBakaButton().onclick = () => {
    runPopupTask(() => navigateToConfiguredMangaBakaPage(), "Unable to open MangaBaka.");
  };

  getOptionsButton().onclick = () => {
    setOptionsPanelOpen(!isOptionsPanelOpen());
  };

  getProvidersTabButton().onclick = () => {
    runPopupTask(() => updateOptionsPanelTab("providers"), "Unable to save the selected options tab.");
  };
  getExtensionTabButton().onclick = () => {
    runPopupTask(() => updateOptionsPanelTab("extension"), "Unable to save the selected options tab.");
  };
  getInfoTabButton().onclick = () => {
    runPopupTask(() => updateOptionsPanelTab("info"), "Unable to load extension information.");
  };
  getInfoVersionNode().onclick = () => {
    currentVersionInfoMode = currentVersionInfoMode === "version" ? "releaseDate" : "version";
    renderInfoPanel();
  };
  getInfoCachedSeriesStatButton().onclick = () => {
    currentCacheSeriesStatFormat = currentCacheSeriesStatFormat === "count" ? "size" : "count";
    renderInfoPanel();
  };
  getInfoMangaDexPurgeStatButton().onclick = () => {
    currentMangaDexPurgeStatFormat = currentMangaDexPurgeStatFormat === "percent" ? "fraction" : "percent";
    renderInfoPanel();
  };
  getInfoResetExtensionButton().onclick = () => {
    requestMultiClickConfirmation(
      getInfoResetExtensionButton(),
      [
        "Reset Extension requires 2 more clicks. This will clear all extension settings, cache, and history.",
        "Reset Extension requires 1 more click. This cannot be undone.",
      ],
      handleExtensionReset,
      "action-button--confirm",
    );
    scrollPopupToBottom();
  };

  const wireProviderOption = (providerKey: ProviderKey, input: HTMLInputElement): void => {
    input.onchange = () => {
      runPopupTask(() => updateSettings({
        ...currentSettings,
        enabledProviders: {
          ...currentSettings.enabledProviders,
          [providerKey]: input.checked,
        },
      }), `Unable to update ${getProviderDisplayLabel(providerKey)} settings.`);
    };
  };

  wireProviderOption("atsu", getAtsuOptionInput());
  wireProviderOption("mangadex", getMangaDexOptionInput());
  wireProviderOption("mangafire", getMangaFireOptionInput());
  wireProviderOption("weebcentral", getWeebCentralOptionInput());
  if (__ADULT_PROVIDERS_ENABLED__) {
    wireProviderOption("ehentai", getEHentaiOptionInput());
    wireProviderOption("exhentai", getExHentaiOptionInput());
  }

  getProviderLabelModeSelect().onchange = () => {
    const value = getProviderLabelModeSelect().value;
    runPopupTask(() => updateSettings({
      ...currentSettings,
      providerLabelMode: value === "icons" || value === "stacked" ? value : DEFAULT_PROVIDER_LABEL_MODE,
    }), "Unable to update the provider label setting.");
  };

  getMangaBakaLinkTypeSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      mangaBakaLinkType: normalizeLinkTargetType(getMangaBakaLinkTypeSelect().value),
    }), "Unable to update the MangaBaka link setting.");
  };

  getSearchLinkTypeSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      searchLinkType: normalizeLinkTargetType(getSearchLinkTypeSelect().value),
    }), "Unable to update the search link setting.");
  };

  getProviderLinkTypeSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      providerLinkType: normalizeLinkTargetType(getProviderLinkTypeSelect().value),
    }), "Unable to update the provider link setting.");
  };

  getContextMenuModeSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      contextMenuMode: normalizeContextMenuMode(getContextMenuModeSelect().value),
    }), "Unable to update the context menu setting.");
  };

  getContextMenuLinkTypeSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      contextMenuLinkType: normalizeContextMenuLinkType(getContextMenuLinkTypeSelect().value),
    }), "Unable to update the context menu link setting.");
  };

  getMangaBakaButtonTargetSelect().onchange = () => {
    runPopupTask(() => updateSettings({
      ...currentSettings,
      mangaBakaButtonTarget: normalizeMangaBakaButtonTarget(getMangaBakaButtonTargetSelect().value),
    }), "Unable to update the MangaBaka button setting.");
  };

  getMangaBakaProfileNameInput().oninput = () => {
    currentSettings = {
      ...currentSettings,
      mangaBakaProfileName: getMangaBakaProfileNameInput().value,
    };
    renderMangaBakaNavigationControls();
    queueProfileNameSave();
  };
  getMangaBakaProfileNameInput().onchange = () => {
    if (profileNameSaveTimer != null) {
      window.clearTimeout(profileNameSaveTimer);
      profileNameSaveTimer = null;
    }
    runPopupTask(
      () => saveSettings(currentSettings),
      "Unable to save the MangaBaka profile name.",
    );
  };
}

function renderOptionsPanel(): void {
  getAtsuOptionInput().checked = currentSettings.enabledProviders.atsu;
  getMangaDexOptionInput().checked = currentSettings.enabledProviders.mangadex;
  getComixToOptionInput().checked = false;
  getMangaFireOptionInput().checked = currentSettings.enabledProviders.mangafire;
  getWeebCentralOptionInput().checked = currentSettings.enabledProviders.weebcentral;
  if (__ADULT_PROVIDERS_ENABLED__) {
    getEHentaiOptionInput().checked = currentSettings.enabledProviders.ehentai;
    getExHentaiOptionInput().checked = currentSettings.enabledProviders.exhentai;
  }
  getProviderLabelModeSelect().value = currentSettings.providerLabelMode;
  getMangaBakaLinkTypeSelect().value = currentSettings.mangaBakaLinkType;
  getSearchLinkTypeSelect().value = currentSettings.searchLinkType;
  getProviderLinkTypeSelect().value = currentSettings.providerLinkType;
  getContextMenuModeSelect().value = currentSettings.contextMenuMode;
  getContextMenuLinkTypeSelect().value = currentSettings.contextMenuLinkType;
  const contextMenuLinkTypeEnabled = isContextMenuLinkTypeEnabled(currentSettings.contextMenuMode);
  getContextMenuLinkTypeRow().classList.toggle("option-row--disabled", !contextMenuLinkTypeEnabled);
  getContextMenuLinkTypeRow().setAttribute("aria-disabled", String(!contextMenuLinkTypeEnabled));
  getContextMenuLinkTypeSelect().disabled = !contextMenuLinkTypeEnabled;
  getMangaBakaButtonTargetSelect().value = currentSettings.mangaBakaButtonTarget;
  getMangaBakaProfileNameInput().value = currentSettings.mangaBakaProfileName;
  renderInfoPanel();
  renderOptionsPanelTabs();
  renderMangaBakaNavigationControls();
}

async function updateSettings(settings: ExtensionSettings): Promise<void> {
  if (isExtensionResetting) {
    return;
  }
  const previousSettings = currentSettings;
  currentSettings = settings;
  renderOptionsPanel();
  await saveSettings(currentSettings);
  if (isExtensionResetting) {
    return;
  }
  void syncActionIcon();

  await queueCacheMutation(async () => {
    if (currentCache) {
      const searchedProviders = { ...currentCache.searchedProviders };
      for (const provider of PROVIDERS) {
        if (
          !previousSettings.enabledProviders[provider.key] &&
          currentSettings.enabledProviders[provider.key] &&
          !searchedProviders[provider.key]
        ) {
          searchedProviders[provider.key] = false;
        }
      }

      const updatedCache: CachedLookup = {
        ...currentCache,
        searchedProviders,
      };
      await saveCache(updatedCache);
      currentCache = updatedCache;
    }
  });

  await rerenderCurrentView();
}

async function updateOptionsPanelTab(optionsPanelTab: OptionsPanelTab): Promise<void> {
  if (isExtensionResetting) {
    return;
  }
  if (currentSettings.optionsPanelTab === optionsPanelTab) {
    renderOptionsPanelTabs();
    if (optionsPanelTab === "info" && isOptionsPanelOpen()) {
      await refreshInfoPanelStatsIfNeeded();
    }
    return;
  }

  currentSettings = {
    ...currentSettings,
    optionsPanelTab,
  };
  renderOptionsPanelTabs();
  if (optionsPanelTab === "info" && isOptionsPanelOpen()) {
    await refreshInfoPanelStatsIfNeeded();
  }
  await saveSettings(currentSettings);
}

function renderOptionsPanelTabs(): void {
  const activeTab = currentSettings.optionsPanelTab;

  getProvidersTabButton().setAttribute("aria-selected", activeTab === "providers" ? "true" : "false");
  getProvidersTabButton().tabIndex = activeTab === "providers" ? 0 : -1;
  getProvidersTabPanel().hidden = activeTab !== "providers";

  getExtensionTabButton().setAttribute("aria-selected", activeTab === "extension" ? "true" : "false");
  getExtensionTabButton().tabIndex = activeTab === "extension" ? 0 : -1;
  getExtensionTabPanel().hidden = activeTab !== "extension";

  getInfoTabButton().setAttribute("aria-selected", activeTab === "info" ? "true" : "false");
  getInfoTabButton().tabIndex = activeTab === "info" ? 0 : -1;
  getInfoTabPanel().hidden = activeTab !== "info";
}

function renderInfoPanel(): void {
  getInfoVersionLabelNode().textContent = currentVersionInfoMode === "version" ? "Version Name" : "Build Date";
  getInfoVersionNode().textContent = currentVersionInfoMode === "version" ? EXTENSION_VERSION_NAME : EXTENSION_BUILD_DATE;
  getInfoVersionNode().title = currentVersionInfoMode === "version"
    ? "Click to show the build date"
    : "Click to show the version name";
  getInfoVersionNode().setAttribute("aria-label", getInfoVersionNode().title);
  renderInstallSourceInfo();
  renderInstallUpdateInfo();
  renderCachedSeriesStat();
  getInfoMangaDexPurgeRow().hidden = !currentSettings.enabledProviders.mangadex;
  renderMangaDexPurgeStat();
}

function renderInstallSourceInfo(): void {
  const installSource = getInstallSourceInfo();
  const installSourceNode = getInfoInstallSourceNode();

  installSourceNode.textContent = installSource.url ? `${installSource.label} ↗` : `${installSource.label} (TBD)`;
  if (installSource.url) {
    installSourceNode.textContent = `${installSource.label} \u2197`;
    installSourceNode.href = installSource.url;
    installSourceNode.setAttribute("aria-disabled", "false");
    installSourceNode.tabIndex = 0;
    return;
  }

  installSourceNode.textContent = `${installSource.label} (TBD)`;
  installSourceNode.removeAttribute("href");
  installSourceNode.setAttribute("aria-disabled", "true");
  installSourceNode.tabIndex = -1;
}

function renderInstallUpdateInfo(): void {
  const installSource = getInstallSourceInfo();
  const installUpdateNode = getInfoInstallUpdateNode();

  if (installSource.kind !== "local") {
    delete installUpdateNode.dataset.updateStatus;
    installUpdateNode.hidden = true;
    setInfoPanelLinkState(installUpdateNode, "", null);
    return;
  }

  installUpdateNode.hidden = false;
  if (!currentReleaseUpdateInfo) {
    installUpdateNode.dataset.updateStatus = "checking";
    setInfoPanelLinkState(installUpdateNode, "[Checking...]", null);
    return;
  }

  if (currentReleaseUpdateInfo.status === "update_available") {
    installUpdateNode.dataset.updateStatus = "available";
    setInfoPanelLinkState(
      installUpdateNode,
      `[${formatLatestReleaseLabel(currentReleaseUpdateInfo.latestTagName ?? currentReleaseUpdateInfo.latestVersion)} Available]`,
      currentReleaseUpdateInfo.latestReleaseUrl,
    );
    return;
  }

  installUpdateNode.dataset.updateStatus = "up-to-date";
  setInfoPanelLinkState(installUpdateNode, "[Up-to-date]", null);
}

function renderMangaDexPurgeStat(): void {
  const purgeStatButton = getInfoMangaDexPurgeStatButton();
  const { purgedCount, totalCount } = currentMangaDexPurgeStats;
  const hasStats = totalCount > 0;
  const percentage = hasStats ? (purgedCount / totalCount) * 100 : null;
  const iconKey = getMangaDexPurgeIconKey(percentage ?? -1);

  const label = hasStats
    ? currentMangaDexPurgeStatFormat === "fraction"
      ? `${purgedCount}/${totalCount}`
      : `${formatPercentage(purgedCount, totalCount)}`
    : "N/A";
  setInfoPanelToggleContent(purgeStatButton, label, hasStats ? iconKey : null);
  purgeStatButton.disabled = !hasStats;
  purgeStatButton.title = hasStats
    ? currentMangaDexPurgeStatFormat === "fraction"
      ? "Click to show as a percentage"
      : "Click to show as a fraction"
    : "No cached MangaDex entries";
  purgeStatButton.setAttribute("aria-label", purgeStatButton.title);
}

function renderCachedSeriesStat(): void {
  const cacheSeriesStatButton = getInfoCachedSeriesStatButton();
  const { seriesCount, totalBytes } = currentCacheSeriesStats;
  const isShowingSize = currentCacheSeriesStatFormat === "size";

  cacheSeriesStatButton.textContent = isShowingSize ? formatByteSize(totalBytes) : `${seriesCount} Series`;
  cacheSeriesStatButton.disabled = false;
  cacheSeriesStatButton.title = isShowingSize ? "Click to show the cached series count" : "Click to show the cache size";
  cacheSeriesStatButton.setAttribute("aria-label", cacheSeriesStatButton.title);
}

function buildCachedResultFlags(
  results: LookupResults,
  fromCache: boolean,
): Partial<Record<ProviderKey, boolean>> {
  return PROVIDER_KEYS.reduce(
    (flags, providerKey) => {
      if (fromCache && results[providerKey]) {
        flags[providerKey] = true;
      }
      return flags;
    },
    {} as Partial<Record<ProviderKey, boolean>>,
  );
}

function getInstallSourceInfo(): InstallSourceInfo {
  if (/\(Google\)$/i.test(EXTENSION_VERSION_NAME)) {
    return { kind: "google", label: "Chrome Web Store", url: GOOGLE_INSTALL_SOURCE_URL };
  }

  if (/\(Firefox\)$/i.test(EXTENSION_VERSION_NAME)) {
    return { kind: "firefox", label: "Firefox", url: null };
  }

  return { kind: "local", label: "Local", url: LOCAL_INSTALL_SOURCE_URL };
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "N/A";
  }

  const percentage = (numerator / denominator) * 100;
  return `${percentage % 1 === 0 ? percentage.toFixed(0) : percentage.toFixed(1)}%`;
}

function getMangaDexPurgeIconKey(percentage: number): MangaDexStatusIconKey | null {
  if (percentage < 0) {
    return null;
  }

  if (percentage === 0) {
    return "slight-smile";
  }

  if (percentage < 50) {
    return "melting-face";
  }

  return "clown-face";
}

function createStatusIconSvg(className: string, iconKey: MangaDexStatusIconKey): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = MANGADEX_STATUS_ICON_MARKUP[iconKey].trim();
  const icon = template.content.firstElementChild;
  if (!(icon instanceof SVGSVGElement)) {
    throw new Error(`Missing SVG markup for status icon: ${iconKey}`);
  }
  icon.classList.add(className);
  return icon;
}

function setInfoPanelToggleContent(button: HTMLButtonElement, text: string, iconKey: MangaDexStatusIconKey | null): void {
  const children: Node[] = [document.createTextNode(text)];
  if (iconKey) {
    children.push(createStatusIconSvg("info-panel-toggle-icon", iconKey));
  }
  button.replaceChildren(...children);
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes % 1 === 0 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MBytes`;
  }

  if (bytes >= 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes % 1 === 0 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KBytes`;
  }

  return `${bytes} Bytes`;
}

function estimateStorageEntryBytes(key: string, value: unknown): number {
  const encoder = new TextEncoder();
  const serializedValue = JSON.stringify(value);
  return encoder.encode(key).length + encoder.encode(serializedValue).length;
}

function isProviderMatch(value: unknown): value is ProviderMatch {
  if (!value || typeof value !== "object") {
    return false;
  }
  const match = value as Partial<ProviderMatch>;
  return (
    typeof match.provider === "string"
    && typeof match.title === "string"
    && match.title.trim().length > 0
    && typeof match.url === "string"
    && /^https?:\/\//i.test(match.url)
    && (match.latestChapterNumber === null || typeof match.latestChapterNumber === "string")
    && (match.latestChapterLanguage === null || match.latestChapterLanguage === "en")
  );
}

function getMangaDexChapterState(result: ProviderMatch | null): MangaDexChapterState | null {
  if (result?.provider !== "MangaDex") {
    return null;
  }

  if (result.manualMangaDexChapterState === "purged" || result.manualMangaDexChapterState === "no_chapters_tld") {
    return result.manualMangaDexChapterState;
  }

  if (result.mangaDexChapterState === "available"
    || (typeof result.latestChapterNumber === "string" && result.latestChapterNumber.length > 0)) {
    return "available";
  }

  return result.mangaDexChapterState === "no_chapters_tld" ? "no_chapters_tld" : "purged";
}

function isMangadexPurgedResult(result: ProviderMatch | null): boolean {
  return getMangaDexChapterState(result) === "purged";
}

function isMangadexNoChaptersTlResult(result: ProviderMatch | null): boolean {
  return getMangaDexChapterState(result) === "no_chapters_tld";
}

function isManuallyPurgedMangaDexResult(result: ProviderMatch | null): boolean {
  return result?.provider === "MangaDex" && typeof result.manualPurgedChapterNumber === "string" && result.manualPurgedChapterNumber.length > 0;
}

function isManuallyNoChaptersTlMangaDexResult(result: ProviderMatch | null): boolean {
  return result?.provider === "MangaDex" && result.manualMangaDexChapterState === "no_chapters_tld";
}

function canToggleMangaDexChapterState(result: ProviderMatch | null): boolean {
  const chapterState = getMangaDexChapterState(result);
  return result?.provider === "MangaDex"
    && (
      chapterState === "available"
      || chapterState === "purged"
      || chapterState === "no_chapters_tld"
    );
}

async function refreshInfoPanelStats(): Promise<void> {
  const requestedRevision = infoPanelStatsRevision;
  requestReleaseUpdateStatus();
  const storedEntries = await chrome.storage.local.get(null);
  currentReleaseUpdateInfo = isReleaseUpdateInfo(storedEntries[POPUP_RELEASE_UPDATE_STORAGE_KEY])
    ? storedEntries[POPUP_RELEASE_UPDATE_STORAGE_KEY]
    : null;
  let purgedCount = 0;
  let totalCount = 0;
  let seriesCount = 0;
  let totalBytes = 0;

  for (const [key, value] of Object.entries(storedEntries)) {
    if (!key.startsWith(LOOKUP_CACHE_PREFIX) || !isLookupCacheV12(value)) {
      continue;
    }

    seriesCount += 1;
    totalBytes += estimateStorageEntryBytes(key, value);

    const mangaDexResult = hydrateProviderState(refreshMangaDexCacheRevision(value.providers)).results.mangadex;
    if (!mangaDexResult) {
      continue;
    }

    totalCount += 1;
    if (isMangadexPurgedResult(mangaDexResult)) {
      purgedCount += 1;
    }
  }

  currentCacheSeriesStats = { seriesCount, totalBytes };
  currentMangaDexPurgeStats = { purgedCount, totalCount };
  hasLoadedInfoPanelStats = requestedRevision === infoPanelStatsRevision;
  renderInfoPanel();
}

async function handleExtensionReset(): Promise<void> {
  if (isExtensionResetting) {
    return;
  }
  isExtensionResetting = true;
  invalidateLookupGeneration();
  metadataRefreshInProgress = false;
  setStatus("Resetting extension...", "loading");
  currentCache = null;
  if (profileNameSaveTimer != null) {
    window.clearTimeout(profileNameSaveTimer);
    profileNameSaveTimer = null;
  }
  try {
    await settingsWriteQueue.catch(() => undefined);
    await queueCacheMutation(async () => {
      await cacheStorageWriteQueue.catch(() => undefined);
      await chrome.storage.local.clear();
    });
  } catch (error) {
    isExtensionResetting = false;
    throw error;
  }
  currentCachedResultFlags = {};
  currentSettings = {
    ...DEFAULT_SETTINGS,
    enabledProviders: { ...DEFAULT_ENABLED_PROVIDERS },
  };
  retryCountdowns = {};
  retryInProgress = {};
  providerActionsInProgress = {};
  armedReadLinkSaves = {};
  readLinkSaveInProgress = null;
  currentCacheSeriesStats = { seriesCount: 0, totalBytes: 0 };
  currentMangaDexPurgeStats = { purgedCount: 0, totalCount: 0 };
  currentCacheSeriesStatFormat = "count";
  currentMangaDexPurgeStatFormat = "percent";
  currentVersionInfoMode = "version";
  setStatus("Extension reset complete", "success");
  window.location.reload();
}

function scrollPopupToBottom(): void {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
}

function isOptionsPanelOpen(): boolean {
  return getOptionsPanel().dataset.open === "true";
}

function setOptionsPanelOpen(isOpen: boolean): void {
  const panel = getOptionsPanel();
  panel.dataset.open = isOpen ? "true" : "false";
  panel.hidden = !isOpen;
  if (isOpen) {
    clearPendingConfirmation();
    if (currentSettings.optionsPanelTab === "info") {
      runPopupTask(
        () => refreshInfoPanelStatsIfNeeded(),
        "Unable to load extension information.",
      );
    }
  }
  getOptionsButton().setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderMangaBakaNavigationControls(): void {
  const button = getMangaBakaButton();
  const profileRow = getMangaBakaProfileRow();
  const profileInput = getMangaBakaProfileNameInput();
  const isProfileTarget = currentSettings.mangaBakaButtonTarget === "profile";

  profileRow.classList.toggle("option-row--disabled", !isProfileTarget);
  profileInput.disabled = !isProfileTarget;

  const buttonUrl = buildMangaBakaNavigationUrl(currentSettings);
  button.hidden = false;
  button.disabled = buttonUrl == null;
  button.innerHTML = currentSettings.mangaBakaLinkType === "new" ? MANGABAKA_GLOBE_NEW_TAB_ICON : MANGABAKA_GLOBE_ICON;
  button.title = getMangaBakaButtonTitle(currentSettings, buttonUrl);
  button.setAttribute("aria-label", button.title);
}

function getMangaBakaButtonTitle(settings: ExtensionSettings, targetUrl: string | null): string {
  if (settings.mangaBakaButtonTarget === "profile" && !settings.mangaBakaProfileName.trim()) {
    return "Enter a profile name to enable the MangaBaka-Link button";
  }

  const targetLabel = settings.mangaBakaLinkType === "new" ? "new tab" : "current tab";
  return targetUrl ? `Open ${targetUrl} in the ${targetLabel}` : "Open MangaBaka";
}

function buildMangaBakaNavigationUrl(settings: Pick<ExtensionSettings, "mangaBakaButtonTarget" | "mangaBakaProfileName">): string | null {
  switch (settings.mangaBakaButtonTarget) {
    case "root":
      return "https://mangabaka.org/";
    case "library":
      return "https://mangabaka.org/my/library";
    case "profile": {
      const profileName = settings.mangaBakaProfileName.trim();
      if (!profileName) {
        return null;
      }

      return `https://mangabaka.org/u/${encodeURIComponent(profileName)}`;
    }
    default:
      return "https://mangabaka.org/";
  }
}

async function navigateToConfiguredMangaBakaPage(): Promise<void> {
  const targetUrl = buildMangaBakaNavigationUrl(currentSettings);
  if (!targetUrl) {
    setStatus("Enter a MangaBaka profile name to use the button.", "error");
    return;
  }

  try {
    await openUrlWithPreference(targetUrl, currentSettings.mangaBakaLinkType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to navigate to MangaBaka.";
    setStatus(message, "error");
  }
}

async function openUrlWithPreference(url: string, linkType: LinkTargetType): Promise<void> {
  if (linkType === "new") {
    await chrome.tabs.create({ url });
    window.close();
    return;
  }

  const tabId = await resolveUsableTabId();
  if (tabId == null) {
    throw new Error("No active tab available.");
  }

  try {
    await chrome.tabs.update(tabId, { url });
  } catch (error) {
    if (!isPopupMissingTabError(error)) {
      throw error;
    }

    await chrome.tabs.create({ url });
  }

  window.close();
}

function matchProviderPage(url: string): { providerKey: ProviderKey; pageType: "series" | "chapter" | null } | null {
  const outcome = matchRegisteredProviderPage(url);
  if (!outcome || outcome.kind !== "found") {
    return null;
  }
  return {
    providerKey: outcome.value.providerId as ProviderKey,
    pageType: outcome.value.pageType,
  };
}

async function getProviderPageContext(url: string): Promise<ProviderPageContext | null> {
  const match = matchProviderPage(url);
  if (!match || !currentSettings.enabledProviders[match.providerKey]) {
    return null;
  }

  if (match.pageType == null) {
    return {
      version: 1,
      kind: "provider-page",
      url,
      providerKey: match.providerKey,
      providerLabel: PROVIDER_LABELS[match.providerKey],
      pageType: null,
      primaryTitle: PROVIDER_LABELS[match.providerKey],
      titles: [],
      sourceUrl: url,
      isSearchable: false,
    };
  }

  const metadata = await extractProviderPageMetadata(match.providerKey, url, match.pageType);
  const titles = metadata?.titles ?? [];

  return {
    version: 1,
    kind: "provider-page",
    url,
    providerKey: match.providerKey,
    providerLabel: PROVIDER_LABELS[match.providerKey],
    pageType: match.pageType,
    primaryTitle: titles.length > 0
      ? match.providerKey === "mangadex" ? titles[0] : pickPreferredTitle(titles)
      : PROVIDER_LABELS[match.providerKey],
    titles,
    sourceUrl: url,
    isSearchable: titles.length > 0,
  };
}

async function extractProviderPageMetadata(
  providerKey: ProviderKey,
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  if (providerKey === "mangadex") {
    // The API identifies the current manga by UUID. Page headings and links
    // can describe navigation, loading states, or other series.
    return fetchMangaDexProviderPageMetadata(sourceUrl, pageType);
  }

  const liveMetadata = await extractProviderPageMetadataFromActiveTab(providerKey, sourceUrl);
  if (liveMetadata?.titles.length) {
    return liveMetadata;
  }

  const fetchedMetadata = await fetchProviderPageMetadata(providerKey, sourceUrl, pageType);
  if (fetchedMetadata?.titles.length) {
    return fetchedMetadata;
  }

  return null;
}

async function fetchProviderPageMetadata(
  providerKey: ProviderKey,
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  if (__ADULT_PROVIDERS_ENABLED__ && (providerKey === "ehentai" || providerKey === "exhentai")) {
    return null;
  }
  switch (providerKey) {
    case "atsu":
      return fetchAtsumaruProviderPageMetadata(sourceUrl, pageType);
    case "mangadex":
      return fetchMangaDexProviderPageMetadata(sourceUrl, pageType);
    case "mangafire":
      return fetchMangaFireProviderPageMetadata(sourceUrl);
    case "weebcentral":
      return fetchWeebCentralProviderPageMetadata(sourceUrl, pageType);
    case "comixto":
    default:
      return null;
  }
}

async function fetchProviderDocumentWithStatus(
  sourceUrl: string,
): Promise<{ status: number | null; document: Document | null }> {
  const pageOutcome = matchRegisteredProviderPage(sourceUrl);
  if (!pageOutcome || pageOutcome.kind !== "found") {
    return { status: null, document: null };
  }
  const adapter = getProviderAdapter(pageOutcome.providerId);
  if (!adapter) {
    return { status: null, document: null };
  }
  const responseOutcome = await fetchProviderText({
    providerId: adapter.id,
    url: sourceUrl,
    credentialPolicy: adapter.credentialPolicy,
  });
  if (responseOutcome.kind !== "found") {
    return { status: responseOutcome.httpStatus ?? null, document: null };
  }
  return {
    status: responseOutcome.value.status,
    document: new DOMParser().parseFromString(responseOutcome.value.body, "text/html"),
  };
}

async function fetchProviderDocument(sourceUrl: string): Promise<Document | null> {
  const result = await fetchProviderDocumentWithStatus(sourceUrl);
  return result.document;
}

function parseAtsumaruEmbeddedTitles(scriptText: string): string[] {
  const match = scriptText.match(/window\.mangaPage\s*=\s*(\{[\s\S]*?});/);
  if (!match) {
    return [];
  }

  try {
    const payload = JSON.parse(match[1]) as {
      mangaPage?: {
        title?: string;
        englishTitle?: string | null;
        otherNames?: string[];
      };
    };

    const mangaPage = payload.mangaPage;
    return dedupeTitles([
      mangaPage?.title ?? "",
      mangaPage?.englishTitle ?? "",
      ...(mangaPage?.otherNames ?? []),
    ]);
  } catch {
    return [];
  }
}

function getDocumentMetaContent(documentNode: Document, selector: string): string {
  return documentNode.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
}

function getTextContent(documentNode: Document | Element, selector: string): string {
  return documentNode.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getSeriesTitlesFromAnchors(documentNode: Document, pathPattern: RegExp): string[] {
  const titles: string[] = [];
  for (const anchor of Array.from(documentNode.querySelectorAll("a[href]"))) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      continue;
    }

    try {
      const parsedUrl = new URL(anchor.href, "https://placeholder.invalid");
      if (!pathPattern.test(parsedUrl.pathname)) {
        continue;
      }

      const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text) {
        titles.push(text);
      }

      const segments = parsedUrl.pathname.split("/").filter(Boolean);
      const slug = segments.length > 0 ? segments[segments.length - 1] : "";
      if (slug) {
        titles.push(hyphenatedTitleToText(slug));
      }
    } catch {
    }
  }

  return dedupeTitles(titles);
}

function cleanProviderPageSiteSuffix(value: string): string {
  return value
    .replace(/\s+\|\s+Weeb Central$/i, "")
    .replace(/\s+Manga\s*[,:-]\s*Read Manga Online Free$/i, "")
    .replace(/\s+-\s+MangaDex$/i, "")
    .replace(/\s+-\s+Atsumaru$/i, "")
    .replace(/\s+-\s+at+su\.moe$/i, "")
    .replace(/\s+\|\s+Read Online on MangaFire$/i, "")
    .trim();
}

function normalizeProviderPageTitleIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isGenericProviderPageTitle(providerKey: ProviderKey, value: string): boolean {
  const normalized = normalizeProviderPageTitleIdentity(value);
  if (!normalized) {
    return true;
  }

  const providerIdentity = providerKey === "atsu"
    ? "atsumaru"
    : providerKey === "comixto"
      ? "comix"
      : normalizeProviderPageTitleIdentity(PROVIDER_LABELS[providerKey]);

  return normalized === providerIdentity || (providerKey === "comixto" && normalized === "comixto");
}

function stripTrailingChapterInfoFromTitle(value: string): string {
  let cleaned = cleanProviderPageSiteSuffix(value)
    .replace(/^read\s+/i, "")
    .replace(/^chapter\s+[\divxlcdm]+(?:\.\d+)?\s*[:-]\s*/i, "")
    .trim();

  const chapterPattern =
    /\s*(?:[-|,:]\s*)?(?:chapter|ch|episode|ep|page|pages|part|book|vol(?:ume)?)\.?\s*#?[\divxlcdm]+(?:\.\d+)?(?:\s*[-:|,].*)?$/i;
  while (chapterPattern.test(cleaned)) {
    cleaned = cleaned.replace(chapterPattern, "").trim();
  }

  return cleaned.replace(/\s*[-:|,]\s*$/, "").trim();
}

function extractEHentaiBaseTitle(value: string): string {
  const cleaned = cleanProviderPageSiteSuffix(value);
  let result = "";
  let roundDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  let started = false;

  for (const character of cleaned) {
    if (character === "(") {
      roundDepth += 1;
      continue;
    }
    if (character === ")" && roundDepth > 0) {
      roundDepth -= 1;
      continue;
    }
    if (character === "[") {
      squareDepth += 1;
      continue;
    }
    if (character === "]" && squareDepth > 0) {
      squareDepth -= 1;
      continue;
    }
    if (character === "{") {
      curlyDepth += 1;
      continue;
    }
    if (character === "}" && curlyDepth > 0) {
      curlyDepth -= 1;
      continue;
    }
    if (roundDepth > 0 || squareDepth > 0 || curlyDepth > 0) {
      continue;
    }
    if (!started && /\s/.test(character)) {
      continue;
    }
    if (started && (character === "+" || character === "~" || character === ".")) {
      break;
    }

    result += character;
    if (!/\s/.test(character)) {
      started = true;
    }
  }

  return result.replace(/\s+/g, " ").replace(/\s*[-:|,]\s*$/, "").trim();
}

function cleanProviderPageTitle(providerKey: ProviderKey, value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }

  if (__ADULT_PROVIDERS_ENABLED__ && (providerKey === "ehentai" || providerKey === "exhentai")) {
    return extractEHentaiBaseTitle(trimmed);
  }

  switch (providerKey) {
    case "atsu":
    case "mangadex":
    case "mangafire":
    case "weebcentral":
      return stripTrailingChapterInfoFromTitle(trimmed);
    case "comixto":
    default:
      return cleanProviderPageSiteSuffix(trimmed);
  }
}

function cleanProviderPageTitles(providerKey: ProviderKey, titles: string[]): string[] {
  return dedupeTitles(
    titles
      .map((title) => cleanProviderPageTitle(providerKey, title))
      .filter((title) => title && !isGenericProviderPageTitle(providerKey, title)),
  );
}

function getAtsumaruMetadataUrl(sourceUrl: string, pageType: "series" | "chapter"): string {
  if (pageType !== "chapter") {
    return sourceUrl;
  }

  try {
    const parsedUrl = new URL(sourceUrl);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    if (segments[0] === "read" && segments[1]) {
      parsedUrl.pathname = `/manga/${segments[1]}`;
      parsedUrl.search = "";
      parsedUrl.hash = "";
      return parsedUrl.toString();
    }
  } catch {
    return sourceUrl;
  }

  return sourceUrl;
}

function extractAtsumaruProviderPageMetadataFromDocument(documentNode: Document): ExtractedMetadataPayload | null {
  const embeddedTitles = Array.from(documentNode.querySelectorAll("script"))
    .flatMap((script) => parseAtsumaruEmbeddedTitles(script.textContent ?? ""));

  const titles = cleanProviderPageTitles("atsu", [
    ...embeddedTitles,
    getDocumentMetaContent(documentNode, "meta[property='og:title']"),
    documentNode.title,
    getTextContent(documentNode, "h1"),
  ]);

  return titles.length > 0 ? { titles, authors: [] } : null;
}

async function fetchAtsumaruProviderPageMetadata(
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  const documentNode = await fetchProviderDocument(getAtsumaruMetadataUrl(sourceUrl, pageType));
  if (!documentNode) {
    return null;
  }

  return extractAtsumaruProviderPageMetadataFromDocument(documentNode);
}

async function fetchMangaDexProviderPageMetadata(
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  try {
    const parsedUrl = new URL(sourceUrl);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (pageType === "series" && segments[0] === "title" && segments[1]) {
      const response = await fetchProviderText({
        providerId: "mangadex",
        url: `https://api.mangadex.org/manga/${encodeURIComponent(segments[1])}`,
        credentialPolicy: "omit",
        headers: { accept: "application/json" },
      });
      if (response.kind !== "found") {
        return null;
      }

      const parsed = parseMangaDexSeriesTitlesResponse(response.value.body);
      if (parsed.kind !== "found" || parsed.value.seriesId !== segments[1].toLowerCase()) {
        return null;
      }
      const titles = dedupeTitles(parsed.value.titles);
      return titles.length > 0 ? { titles, authors: [] } : null;
    }

    if (pageType === "chapter" && segments[0] === "chapter" && segments[1]) {
      const response = await fetchProviderText({
        providerId: "mangadex",
        ...buildMangaDexChapterMetadataRequest(segments[1]),
      });
      if (response.kind !== "found") {
        return null;
      }

      const chapterMetadata = parseMangaDexChapterSeriesResponse(response.value.body);
      if (chapterMetadata.kind !== "found") {
        return null;
      }

      let titles = dedupeTitles(chapterMetadata.value.titles);
      if (titles.length === 0) {
        const seriesResponse = await fetchProviderText({
          providerId: "mangadex",
          ...buildMangaDexTitleMetadataRequest(chapterMetadata.value.seriesId),
        });
        if (seriesResponse.kind !== "found") {
          return null;
        }
        const seriesMetadata = parseMangaDexSeriesTitlesResponse(seriesResponse.value.body);
        if (seriesMetadata.kind !== "found" || seriesMetadata.value.seriesId !== chapterMetadata.value.seriesId) {
          return null;
        }
        titles = dedupeTitles(seriesMetadata.value.titles);
      }
      return titles.length > 0 ? { titles, authors: [] } : null;
    }
  } catch {
    return null;
  }

  return null;
}

function extractMangaFireProviderPageMetadataFromDocument(
  sourceUrl: string,
  documentNode: Document,
): ExtractedMetadataPayload | null {
  const syncDataText = documentNode.getElementById("syncData")?.textContent?.trim() ?? "";
  let syncDataName = "";
  if (syncDataText) {
    try {
      syncDataName = (JSON.parse(syncDataText) as { name?: string }).name ?? "";
    } catch {
      syncDataName = "";
    }
  }

  const parsedUrl = new URL(sourceUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const slugTitle = (segments[0] === "manga" || segments[0] === "read") && segments[1]
    ? hyphenatedTitleToText(segments[1])
    : "";

  const titles = cleanProviderPageTitles("mangafire", [
    syncDataName,
    slugTitle,
    getTextContent(documentNode, "h1[itemprop='name']"),
    getTextContent(documentNode, "#ctrl-menu .head a"),
    getDocumentMetaContent(documentNode, "meta[property='og:title']"),
    documentNode.title,
    ...getSeriesTitlesFromAnchors(documentNode, /^\/manga\/[^/]+$/i),
  ]);

  return titles.length > 0 ? { titles, authors: [] } : null;
}

async function fetchMangaFireProviderPageMetadata(sourceUrl: string): Promise<ExtractedMetadataPayload | null> {
  const documentNode = await fetchProviderDocument(sourceUrl);
  if (!documentNode) {
    return null;
  }

  return extractMangaFireProviderPageMetadataFromDocument(sourceUrl, documentNode);
}

function extractWeebCentralProviderPageMetadataFromDocument(
  sourceUrl: string,
  pageType: "series" | "chapter",
  documentNode: Document | null,
): ExtractedMetadataPayload | null {
  const parsedUrl = new URL(sourceUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const slugTitle = pageType === "series" && segments[0] === "series" && segments[2]
    ? hyphenatedTitleToText(segments[2])
    : "";

  const fetchedTitles = documentNode
    ? [
        getDocumentMetaContent(documentNode, "meta[property='og:title']"),
        getDocumentMetaContent(documentNode, "meta[name='twitter:title']"),
        documentNode.title,
        getTextContent(documentNode, "h1"),
        getTextContent(documentNode, "main h1"),
        ...getSeriesTitlesFromAnchors(documentNode, /^\/series\/[^/]+(?:\/[^/]+)?$/i),
      ]
    : [];

  const titles = cleanProviderPageTitles("weebcentral", [slugTitle, ...fetchedTitles]);
  return titles.length > 0 ? { titles, authors: [] } : null;
}

async function fetchWeebCentralProviderPageMetadata(
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  const documentNode = await fetchProviderDocument(sourceUrl);
  return extractWeebCentralProviderPageMetadataFromDocument(sourceUrl, pageType, documentNode);
}

async function extractProviderPageMetadataFromActiveTab(
  providerKey: ProviderKey,
  sourceUrl: string,
): Promise<ExtractedMetadataPayload | null> {
  const tabId = await resolveUsableTabId();
  if (tabId == null) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [providerKey, sourceUrl],
      func: (activeProviderKey: ProviderKey, activeSourceUrl: string) => {
        if (activeProviderKey === "mangadex") {
          return null;
        }
        const parsedSourceUrl = new URL(activeSourceUrl);
        const sourceSegments = parsedSourceUrl.pathname.split("/").filter(Boolean);

        const normalizeTitle = (title: string): string =>
          title
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

        const cleanSiteSuffix = (value: string): string =>
          value
            .replace(/\s+\|\s+Weeb Central$/i, "")
            .replace(/\s+Manga\s+-\s+Read Manga Online Free$/i, "")
            .replace(/\s+-\s+MangaDex$/i, "")
            .replace(/\s+-\s+Atsumaru$/i, "")
            .replace(/\s+-\s+at+su\.moe$/i, "")
            .trim();

        const stripTrailingChapterInfo = (value: string): string => {
          let cleaned = cleanSiteSuffix(value)
            .replace(/^read\s+/i, "")
            .replace(/^chapter\s+[\divxlcdm]+(?:\.\d+)?\s*[:-]\s*/i, "")
            .trim();

          const chapterPattern =
            /\s*(?:[-|:]\s*)?(?:chapter|ch|episode|ep|page|pages|part|book|vol(?:ume)?)\.?\s*#?[\divxlcdm]+(?:\.\d+)?(?:\s*[-:|].*)?$/i;
          while (chapterPattern.test(cleaned)) {
            cleaned = cleaned.replace(chapterPattern, "").trim();
          }

          return cleaned.replace(/\s*[-:|]\s*$/, "").trim();
        };

        const extractEHentaiBaseTitle = (value: string): string => {
          const cleaned = cleanSiteSuffix(value);
          let result = "";
          let roundDepth = 0;
          let squareDepth = 0;
          let curlyDepth = 0;
          let started = false;

          for (const character of cleaned) {
            if (character === "(") {
              roundDepth += 1;
              continue;
            }
            if (character === ")" && roundDepth > 0) {
              roundDepth -= 1;
              continue;
            }
            if (character === "[") {
              squareDepth += 1;
              continue;
            }
            if (character === "]" && squareDepth > 0) {
              squareDepth -= 1;
              continue;
            }
            if (character === "{") {
              curlyDepth += 1;
              continue;
            }
            if (character === "}" && curlyDepth > 0) {
              curlyDepth -= 1;
              continue;
            }

            if (roundDepth > 0 || squareDepth > 0 || curlyDepth > 0) {
              continue;
            }

            if (!started && /\s/.test(character)) {
              continue;
            }

            if (started && (character === "+" || character === "~" || character === ".")) {
              break;
            }

            result += character;
            if (!/\s/.test(character)) {
              started = true;
            }
          }

          return result.replace(/\s+/g, " ").replace(/\s*[-:|]\s*$/, "").trim();
        };

        const cleanProviderCandidate = (value: string): string => {
          const trimmed = value.replace(/\s+/g, " ").trim();
          if (!trimmed) {
            return "";
          }

          if (__ADULT_PROVIDERS_ENABLED__ && (activeProviderKey === "ehentai" || activeProviderKey === "exhentai")) {
            return extractEHentaiBaseTitle(trimmed);
          }

          switch (activeProviderKey) {
            case "atsu":
              return stripTrailingChapterInfo(trimmed);
            case "mangafire":
            case "weebcentral":
              return stripTrailingChapterInfo(trimmed);
            default:
              return cleanSiteSuffix(trimmed);
          }
        };

        const dedupeTitles = (titles: string[]): string[] => {
          const seen = new Set<string>();
          const deduped: string[] = [];
          const normalizeProviderTitleIdentity = (value: string): string =>
            value
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, "");
          const isGenericProviderTitle = (value: string): boolean => {
            const normalized = normalizeProviderTitleIdentity(value);
            if (!normalized) {
              return true;
            }

            const providerIdentity = activeProviderKey === "atsu"
              ? "atsumaru"
              : activeProviderKey === "comixto"
                ? "comix"
                : normalizeProviderTitleIdentity(activeProviderKey);

            return normalized === providerIdentity || (activeProviderKey === "comixto" && normalized === "comixto");
          };

          for (const title of titles) {
            const trimmedTitle = title.trim();
            if (!trimmedTitle) {
              continue;
            }

            const normalized = normalizeTitle(trimmedTitle);
            if (!normalized || seen.has(normalized) || isGenericProviderTitle(trimmedTitle)) {
              continue;
            }

            seen.add(normalized);
            deduped.push(trimmedTitle);
          }

          return deduped;
        };

        const hyphenatedTitleToText = (value: string): string =>
          value
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .trim();

        const asString = (value: unknown): string => (typeof value === "string" ? value : "");
        const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
        const asAuthorNames = (value: unknown): string[] =>
          Array.isArray(value)
            ? value
                .map((author) => (author && typeof author === "object" ? asString((author as Record<string, unknown>).name) : ""))
                .filter(Boolean)
            : [];

        const addSelectorText = (selectors: string[], candidates: string[]): void => {
          for (const selector of selectors) {
            const nodes = Array.from(document.querySelectorAll(selector));
            for (const node of nodes) {
              const text = cleanProviderCandidate(node.textContent?.replace(/\s+/g, " ").trim() ?? "");
              if (text) {
                candidates.push(text);
              }
            }
          }
        };

        const addAnchorMatches = (pathPattern: RegExp, candidates: string[]): void => {
          const anchors = Array.from(document.querySelectorAll("a[href]"));
          for (const anchor of anchors) {
            if (!(anchor instanceof HTMLAnchorElement)) {
              continue;
            }

            try {
              const url = new URL(anchor.href, window.location.href);
              if (!pathPattern.test(url.pathname)) {
                continue;
              }

              const text = cleanProviderCandidate(anchor.textContent?.replace(/\s+/g, " ").trim() ?? "");
              if (text) {
                candidates.push(text);
              }
            } catch {
            }
          }
        };

        const addMetaTitle = (selector: string, candidates: string[]): void => {
          const value = cleanProviderCandidate(document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "");
          if (value) {
            candidates.push(value);
          }
        };

        const extractAtsumaruWindowDataTitles = (): string[] => {
          const scriptTexts = Array.from(document.querySelectorAll("script"))
            .map((script) => script.textContent ?? "")
            .filter(Boolean);

          for (const scriptText of scriptTexts) {
            const match = scriptText.match(/window\.mangaPage\s*=\s*(\{[\s\S]*?});/);
            if (!match) {
              continue;
            }

            try {
              const payload = JSON.parse(match[1]) as {
                mangaPage?: {
                  title?: string;
                  englishTitle?: string | null;
                  otherNames?: string[];
                };
              };

              const mangaPage = payload.mangaPage;
              const titles = dedupeTitles([
                cleanProviderCandidate(mangaPage?.title ?? ""),
                cleanProviderCandidate(mangaPage?.englishTitle ?? ""),
                ...(mangaPage?.otherNames ?? []).map(cleanProviderCandidate),
              ]);
              if (titles.length > 0) {
                return titles;
              }
            } catch {
            }
          }

          return [];
        };

        const extractMangaFireSyncDataTitles = (): string[] => {
          const syncDataText = document.getElementById("syncData")?.textContent?.trim() ?? "";
          if (!syncDataText) {
            return [];
          }

          try {
            const payload = JSON.parse(syncDataText) as { name?: string };
            const title = cleanProviderCandidate(payload.name ?? "");
            return title ? [title] : [];
          } catch {
            return [];
          }
        };

        const extractStructuredData = (): ExtractedMetadataPayload | null => {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of scripts) {
            const textContent = script.textContent?.trim();
            if (!textContent) {
              continue;
            }

            try {
              const parsed = JSON.parse(textContent) as unknown;
              const entries = Array.isArray(parsed) ? parsed : [parsed];
              for (const entry of entries) {
                if (!entry || typeof entry !== "object") {
                  continue;
                }

                const record = entry as Record<string, unknown>;
                const titles = dedupeTitles([
                  cleanProviderCandidate(asString(record.name)),
                  cleanProviderCandidate(asString(record.headline)),
                  cleanProviderCandidate(asString(record.alternativeHeadline)),
                  ...asStringArray(record.alternateName).map(cleanProviderCandidate),
                ]);
                if (titles.length > 0) {
                  return { titles, authors: asAuthorNames(record.author) };
                }
              }
            } catch {
            }
          }

          return null;
        };

        const prioritizedCandidates: string[] = [];
        const genericCandidates: string[] = [];
        const pageTitle = document.title.trim();
        if (pageTitle) {
          genericCandidates.push(cleanProviderCandidate(pageTitle));
          genericCandidates.push(cleanSiteSuffix(pageTitle));
        }

        addMetaTitle("meta[property='og:title']", genericCandidates);
        addMetaTitle("meta[name='twitter:title']", genericCandidates);

        if (__ADULT_PROVIDERS_ENABLED__ && (activeProviderKey === "ehentai" || activeProviderKey === "exhentai")) {
          addSelectorText(["#gn", "#gj", "h1"], prioritizedCandidates);
        } else switch (activeProviderKey) {
          case "atsu": {
            prioritizedCandidates.push(...extractAtsumaruWindowDataTitles());
            addSelectorText(["main h1", "main h2", "header h1", "header h2"], prioritizedCandidates);
            addAnchorMatches(/^\/manga\/[^/]+$/i, genericCandidates);
            break;
          }
          case "mangafire": {
            prioritizedCandidates.push(...extractMangaFireSyncDataTitles());
            if ((sourceSegments[0] === "manga" || sourceSegments[0] === "read") && sourceSegments[1]) {
              prioritizedCandidates.push(hyphenatedTitleToText(sourceSegments[1]));
            }
            addAnchorMatches(/^\/manga\/[^/]+$/i, prioritizedCandidates);
            addSelectorText(["main h1", "main h2", "header h1", "header h2", "[class*='title']", "[class*='name']"], prioritizedCandidates);
            break;
          }
          case "weebcentral": {
            if (sourceSegments[0] === "series" && sourceSegments[2]) {
              prioritizedCandidates.push(hyphenatedTitleToText(sourceSegments[2]));
            }
            addAnchorMatches(/^\/series\/[^/]+(?:\/[^/]+)?$/i, prioritizedCandidates);
            addSelectorText(["main h1", "main h2", "header h1", "header h2", "[class*='title']", "[class*='series']"], prioritizedCandidates);
            break;
          }
          default:
            break;
        }

        const structuredData = extractStructuredData();
        addSelectorText(["main h1", "main h2", "main h3", "h1", "h2", "h3", "[role='heading']"], genericCandidates);

        const titles = dedupeTitles([
          ...prioritizedCandidates,
          ...((structuredData?.titles ?? []).map(cleanProviderCandidate)),
          ...genericCandidates.map(cleanProviderCandidate),
        ]);
        return titles.length > 0 ? { titles, authors: structuredData?.authors ?? [] } : null;
      },
    });

    const payload = results?.[0]?.result as ExtractedMetadataPayload | null | undefined;
    return payload && payload.titles.length > 0 ? payload : null;
  } catch (error) {
    if (isPopupMissingTabError(error)) {
      currentTabId = null;
    }

    return null;
  }
}

function getUrlPathSegments(sourceUrl: string): string[] {
  try {
    return new URL(sourceUrl).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function getAtsumaruMangaIdFromUrl(sourceUrl: string): string | null {
  const segments = getUrlPathSegments(sourceUrl);
  return segments[0] === "manga" && segments[1] ? segments[1] : null;
}

function getMangaDexMangaIdFromUrl(sourceUrl: string): string | null {
  const segments = getUrlPathSegments(sourceUrl);
  return segments[0] === "title" && segments[1] ? segments[1] : null;
}

function extractGenericProviderPageMetadataFromDocument(
  providerKey: ProviderKey,
  documentNode: Document,
): ExtractedMetadataPayload | null {
  const titles = cleanProviderPageTitles(providerKey, [
    getDocumentMetaContent(documentNode, "meta[property='og:title']"),
    getDocumentMetaContent(documentNode, "meta[name='twitter:title']"),
    documentNode.title,
    getTextContent(documentNode, "h1"),
    ...extractTitleCandidatesFromDocument(documentNode),
  ]);

  return titles.length > 0 ? { titles, authors: [] } : null;
}

function createEmptyRejectedProviderUrls(): RejectedProviderUrls {
  return cloneRejectedProviderUrls(EMPTY_REJECTED_PROVIDER_URLS);
}

function createEmptyLookupResults(): LookupResults {
  return { ...EMPTY_LOOKUP_RESULTS };
}

function createInitialSearchedProviders(searchedProviderKeys: readonly ProviderKey[]): Record<ProviderKey, boolean> {
  const searchedProviders = createUnsearchedProviders();
  for (const providerKey of searchedProviderKeys) {
    searchedProviders[providerKey] = true;
  }
  return searchedProviders;
}

function cloneRejectedProviderUrls(rejectedUrls: RejectedProviderUrls): RejectedProviderUrls {
  return PROVIDER_KEYS.reduce(
    (result, providerKey) => {
      result[providerKey] = [...rejectedUrls[providerKey]];
      return result;
    },
    {} as RejectedProviderUrls,
  );
}

function createUnsearchedProviders(): Record<ProviderKey, boolean> {
  return PROVIDER_KEYS.reduce((result, providerKey) => {
    result[providerKey] = false;
    return result;
  }, {} as Record<ProviderKey, boolean>);
}

function createCachedSeries(metadata: MangaBakaMetadata): CachedMangaBakaSeries {
  return {
    requestedSeriesId: metadata.apiSeries.requestedSeriesId,
    id: metadata.apiSeries.id,
    canonicalUrl: metadata.apiSeries.canonicalUrl,
    mediaType: metadata.apiSeries.mediaType,
    apiTitles: metadata.apiSeries.titles.map((title) => ({ ...title, traits: [...title.traits] })),
    rankedSearchTitles: [...metadata.titles],
    authors: [...metadata.apiSeries.authors],
    apiLastUpdatedAt: metadata.apiSeries.apiLastUpdatedAt,
    titleFingerprint: createTitleFingerprint(metadata.apiSeries.titles),
  };
}

function createProviderCacheSnapshot(
  results: LookupResults,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
  searchedProviders: Record<ProviderKey, boolean>,
  existingProviders: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.fromEntries(PROVIDER_KEYS.map((providerKey) => {
    const liveOutcome = currentProviderSearchOutcomes[providerKey];
    if (liveOutcome && !isStableProviderSearchOutcome(liveOutcome)) {
      const existingState = existingProviders[providerKey];
      if (existingState && typeof existingState === "object") {
        const existingOutcome = (existingState as { outcome?: unknown }).outcome;
        const existingKind = existingOutcome && typeof existingOutcome === "object"
          ? (existingOutcome as { kind?: unknown }).kind
          : null;
        if (existingKind === "found" || existingKind === "no_match") {
          return [providerKey, existingState];
        }
      }
    }
    const stableOutcome = resolveStableProviderOutcome(
      providerKey as ProviderId,
      liveOutcome,
      results[providerKey],
    );
    return [providerKey, {
      ...(providerKey === "mangadex" ? { lookupRevision: MANGADEX_LOOKUP_REVISION } : {}),
      searched: stableOutcome ? searchedProviders[providerKey] : false,
      result: stableOutcome?.kind === "found" ? results[providerKey] : null,
      outcome: stableOutcome,
      rejectedUrls: [...rejectedUrls[providerKey]],
      titleCursor: titleAttemptIndexes[providerKey],
    }];
  }));
}

function restoreStableProviderSearchOutcomes(providers: Record<string, unknown>): void {
  const restored: Partial<Record<ProviderKey, ProviderSearchOutcome>> = {};
  for (const providerKey of PROVIDER_KEYS) {
    const state = providers[providerKey];
    if (!state || typeof state !== "object") {
      continue;
    }
    const providerState = state as { outcome?: unknown; result?: unknown };
    const outcome = providerState.outcome;
    if (!outcome || typeof outcome !== "object") {
      continue;
    }
    const kind = (outcome as { kind?: unknown }).kind;
    if (kind === "found" && isProviderMatch(providerState.result)) {
      restored[providerKey] = {
        kind: "found",
        providerId: providerKey as ProviderId,
        value: providerState.result,
      };
    } else if (kind === "no_match") {
      restored[providerKey] = { kind: "no_match", providerId: providerKey as ProviderId };
    }
  }
  currentProviderSearchOutcomes = restored;
}

function hydrateProviderState(providers: Record<string, unknown>): {
  results: LookupResults;
  rejectedUrls: RejectedProviderUrls;
  searchedProviders: Record<ProviderKey, boolean>;
  titleAttemptIndexes: Record<ProviderKey, number>;
} {
  const results = createEmptyLookupResults();
  const rejectedUrls = createEmptyRejectedProviderUrls();
  const searchedProviders = createUnsearchedProviders();
  const titleAttemptIndexes = { ...EMPTY_TITLE_ATTEMPT_INDEXES };
  for (const providerKey of PROVIDER_KEYS) {
    const state = providers[providerKey];
    if (!state || typeof state !== "object") {
      continue;
    }
    const providerState = state as {
      outcome?: { kind?: unknown } | null;
      rejectedUrls?: unknown;
      result?: unknown;
      searched?: unknown;
      titleCursor?: unknown;
    };
    const isFound = providerState.outcome?.kind === "found" && isProviderMatch(providerState.result);
    const isNoMatch = providerState.outcome?.kind === "no_match" && providerState.result === null;
    searchedProviders[providerKey] = providerState.searched === true && (isFound || isNoMatch);
    results[providerKey] = isFound ? providerState.result as ProviderMatch : null;
    rejectedUrls[providerKey] = Array.isArray(providerState.rejectedUrls)
      ? providerState.rejectedUrls.filter((url): url is string => typeof url === "string")
      : [];
    titleAttemptIndexes[providerKey] = typeof providerState.titleCursor === "number"
      && Number.isSafeInteger(providerState.titleCursor)
      && providerState.titleCursor >= 0
      ? providerState.titleCursor
      : 0;
  }
  return { results, rejectedUrls, searchedProviders, titleAttemptIndexes };
}

function resolveCachedDisplayTitle(cache: CachedLookup): string {
  const resolved = resolveSeriesTitles(cache.series.apiTitles, { mediaType: cache.series.mediaType });
  if (!resolved) {
    return cache.series.rankedSearchTitles[0] ?? "Unknown series";
  }

  const activeContext = currentPageContextClient?.getLastContext() ?? currentPageContext;
  const contextTitle = activeContext
    && (activeContext.seriesId === cache.series.requestedSeriesId || activeContext.seriesId === cache.series.id)
    ? activeContext.resolvedTitle
    : null;
  return resolveDisplayTitle(resolved, contextTitle);
}

function createMetadataFromCache(cache: CachedLookup): MangaBakaMetadata {
  return {
    seriesId: cache.series.requestedSeriesId.toString(),
    sourceUrl: cache.series.canonicalUrl,
    primaryTitle: resolveCachedDisplayTitle(cache),
    titles: [...cache.series.rankedSearchTitles],
    authors: [...cache.series.authors],
    apiSeries: {
      requestedSeriesId: cache.series.requestedSeriesId,
      id: cache.series.id,
      state: "active",
      mergedFrom: cache.series.id === cache.series.requestedSeriesId ? null : cache.series.requestedSeriesId,
      canonicalUrl: cache.series.canonicalUrl,
      mediaType: cache.series.mediaType,
      titles: cache.series.apiTitles.map((title) => ({ ...title, traits: [...title.traits] })),
      authors: [...cache.series.authors],
      apiLastUpdatedAt: cache.series.apiLastUpdatedAt,
    },
  };
}

async function persistMetadataOnlyInvalidation(metadata: MangaBakaMetadata): Promise<CachedLookup> {
  currentProviderSearchOutcomes = {};
  const invalidatedCache: CachedLookup = {
    schemaVersion: CACHE_VERSION,
    series: createCachedSeries(metadata),
    providers: {},
    results: createEmptyLookupResults(),
    rejectedUrls: createEmptyRejectedProviderUrls(),
    titleAttemptIndexes: { ...EMPTY_TITLE_ATTEMPT_INDEXES },
    searchedProviders: createUnsearchedProviders(),
    searchedAt: new Date().toISOString(),
  };
  await saveCache(invalidatedCache);
  currentCache = invalidatedCache;
  currentCachedResultFlags = {};
  return invalidatedCache;
}

async function loadCache(seriesId: string): Promise<CachedLookup | null> {
  const cacheKey = getCacheKey(seriesId);
  const stored = await chrome.storage.local.get(cacheKey);
  const cache = stored[cacheKey];

  if (!isLookupCacheV12(cache)) {
    return null;
  }
  if (cache.series.requestedSeriesId.toString() !== seriesId) {
    return null;
  }

  const providers = refreshMangaDexCacheRevision(cache.providers);
  const providerState = hydrateProviderState(providers);
  const normalizedCache: CachedLookup = {
    ...cache,
    providers,
    rejectedUrls: providerState.rejectedUrls,
    titleAttemptIndexes: providerState.titleAttemptIndexes,
    results: providerState.results,
    searchedProviders: providerState.searchedProviders,
  };
  restoreStableProviderSearchOutcomes(normalizedCache.providers);
  return normalizedCache;
}

async function saveCache(cache: CachedLookup): Promise<void> {
  const providers = createProviderCacheSnapshot(
    cache.results,
    cache.rejectedUrls,
    cache.titleAttemptIndexes,
    cache.searchedProviders,
    cache.providers,
  );
  const persistedCache: LookupCacheV12 = {
    schemaVersion: CACHE_VERSION,
    series: cache.series,
    providers,
    searchedAt: cache.searchedAt,
  };
  cache.providers = providers;
  const write = cacheStorageWriteQueue.catch(() => undefined).then(() => chrome.storage.local.set({
    [getCacheKey(cache.series.requestedSeriesId.toString())]: persistedCache,
  }));
  cacheStorageWriteQueue = write;
  await write;
  invalidateInfoPanelStats();
}

async function clearCache(seriesId: string): Promise<void> {
  const write = cacheStorageWriteQueue.catch(() => undefined).then(() => chrome.storage.local.remove(getCacheKey(seriesId)));
  cacheStorageWriteQueue = write;
  await write;
  invalidateInfoPanelStats();
}

async function runLookup(
  sourceUrl: string,
  seriesId: string,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
  metadataOverride?: MangaBakaMetadata,
): Promise<void> {
  const generation = beginLookupGeneration();
  currentCache = null;
  currentProviderSearchOutcomes = {};
  metadataRefreshInProgress = false;
  setResetEnabled(false);
  setStatus("Reading MangaBaka metadata...", "loading");
  renderLoadingState();

  try {
    const metadata = metadataOverride ?? (await fetchMangaBakaMetadata(sourceUrl, seriesId));
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    setStatus("Searching enabled providers...", "loading");
    const { outcomes, results, searchedProviderKeys } = await searchProviders(metadata, rejectedUrls, titleAttemptIndexes);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    currentProviderSearchOutcomes = outcomes;
    const searchedProviders = createInitialSearchedProviders(searchedProviderKeys);
    for (const providerKey of PROVIDER_KEYS) {
      const outcome = outcomes[providerKey];
      if (outcome && !isStableProviderSearchOutcome(outcome)) {
        searchedProviders[providerKey] = false;
      }
    }

    const cache: CachedLookup = {
      schemaVersion: CACHE_VERSION,
      series: createCachedSeries(metadata),
      providers: createProviderCacheSnapshot(results, rejectedUrls, titleAttemptIndexes, searchedProviders),
      results,
      rejectedUrls: cloneRejectedProviderUrls(rejectedUrls),
      titleAttemptIndexes: { ...titleAttemptIndexes },
      searchedProviders,
      searchedAt: new Date().toISOString(),
    };

    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    await saveCache(cache);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    currentCache = cache;
    currentCachedResultFlags = buildCachedResultFlags(results, false);
    renderLookup(cache, false);
  } catch (error) {
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    currentCache = null;
    if (error instanceof InvalidMangaBakaPageError) {
      await renderInvalidPageState();
      return;
    }

    const message = error instanceof Error ? error.message : "Search failed.";
    renderErrorState(message);
    wireLookupRetryButton(seriesId);
  }
}

async function fetchMangaBakaMetadata(_sourceUrl: string, seriesId: string): Promise<MangaBakaMetadata> {
  const numericSeriesId = Number(seriesId);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const apiSeries = await new MangaBakaApiClient().getSeries(numericSeriesId, controller.signal);
    const resolved = resolveSeriesTitles(apiSeries.titles, { mediaType: apiSeries.mediaType });
    if (!resolved) {
      throw new Error("MangaBaka returned no usable titles. Retry the lookup.");
    }

    const activeContext = currentPageContextClient?.getLastContext() ?? currentPageContext;
    const contextTitle = activeContext
      && (activeContext.seriesId === numericSeriesId || activeContext.seriesId === apiSeries.id)
      ? activeContext.resolvedTitle
      : null;
    return {
      seriesId,
      sourceUrl: apiSeries.canonicalUrl,
      primaryTitle: resolveDisplayTitle(resolved, contextTitle),
      titles: resolved.orderedTitles,
      authors: apiSeries.authors,
      apiSeries,
    };
  } catch (error) {
    if (
      error instanceof MangaBakaApiError
      && (error.status === 404 || error.status === 410 || error.code === "deleted_series")
    ) {
      throw new InvalidMangaBakaPageError();
    }
    if (error instanceof InvalidMangaBakaPageError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "MangaBaka metadata is unavailable.";
    throw new Error(`${message} Retry the lookup.`);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function searchProviders(
  metadata: MangaBakaMetadata,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
): Promise<{
  outcomes: Partial<Record<ProviderKey, ProviderSearchOutcome>>;
  results: LookupResults;
  searchedProviderKeys: ProviderKey[];
}> {
  const results = createEmptyLookupResults();
  const outcomes: Partial<Record<ProviderKey, ProviderSearchOutcome>> = {};
  const enabledProviderKeys = PROVIDER_KEYS.filter(
    (providerKey) => currentSettings.enabledProviders[providerKey] && providerKey !== "comixto",
  );
  const settledSearches = await Promise.allSettled(
    enabledProviderKeys.map((providerKey) =>
      searchProviderOutcome(providerKey, metadata, rejectedUrls, titleAttemptIndexes)),
  );

  settledSearches.forEach((settled, index) => {
    const providerKey = enabledProviderKeys[index];
    const outcome: ProviderSearchOutcome = settled.status === "fulfilled"
      ? settled.value
      : {
          kind: "unavailable",
          reason: "network",
          providerId: providerKey as ProviderId,
          message: "Provider search failed unexpectedly",
        };
    outcomes[providerKey] = outcome;
    results[providerKey] = outcome.kind === "found" ? outcome.value : null;
  });

  return { outcomes, results, searchedProviderKeys: enabledProviderKeys };
}

async function searchProviderOutcome(
  providerKey: ProviderKey,
  metadata: MangaBakaMetadata,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
): Promise<ProviderSearchOutcome> {
  if (__ADULT_PROVIDERS_ENABLED__ && (providerKey === "ehentai" || providerKey === "exhentai")) {
    return searchEHentai(metadata, rejectedUrls[providerKey], titleAttemptIndexes[providerKey], providerKey);
  }

  switch (providerKey) {
    case "atsu":
      return searchAtsumaru(metadata, rejectedUrls.atsu, titleAttemptIndexes.atsu);
    case "mangadex":
      return searchMangaDex(metadata, rejectedUrls.mangadex, titleAttemptIndexes.mangadex);
    case "comixto":
      return {
        kind: "unsupported",
        providerId: "comixto",
        message: "Comix support is planned but not enabled",
      };
    case "mangafire":
      return searchMangaFire(metadata, rejectedUrls.mangafire, titleAttemptIndexes.mangafire);
    case "weebcentral":
      return searchWeebCentral(metadata, rejectedUrls.weebcentral, titleAttemptIndexes.weebcentral);
    default:
      return {
        kind: "unsupported",
        providerId: providerKey as ProviderId,
        message: "Provider is not supported by this build",
      };
  }
}

function showProviderSearchOutcome(providerLabel: string, outcome: ProviderSearchOutcome): void {
  switch (outcome.kind) {
    case "blocked":
      setStatus(`${providerLabel} blocked automated search. Use Open Search to continue manually.`, "error");
      break;
    case "rate_limited":
      setStatus(`${providerLabel} rate limited this attempt. Retry later without changing titles.`, "error");
      break;
    case "auth_required":
      setStatus(`${providerLabel} requires sign-in. Use Open Search to continue manually.`, "error");
      break;
    case "unavailable":
      setStatus(
        outcome.reason === "timeout"
          ? `${providerLabel} timed out. The current title was not consumed.`
          : `${providerLabel} is unavailable. The current title was not consumed.`,
        "error",
      );
      break;
    case "error":
      setStatus(`${providerLabel} returned an unexpected response. The current title was not consumed.`, "error");
      break;
    case "unsupported":
      setStatus(`${providerLabel} is not supported by this build.`, "error");
      break;
    case "found":
      setStatus("Search complete", "success");
      break;
    case "no_match":
      setStatus(`No ${providerLabel} match found for this title`, "error");
      break;
  }
}

function retypeProviderOutcome<T>(outcome: ProviderOutcome<unknown>): ProviderOutcome<T> {
  return outcome as ProviderOutcome<T>;
}

async function fetchAndParseProviderResponse<T>(
  providerId: ProviderId,
  request: ProviderSearchRequest,
  parseResponse: (body: string) => ProviderOutcome<T>,
): Promise<ProviderOutcome<T>> {
  const transport = await fetchProviderSearchRequest(providerId, request);
  if (transport.kind !== "found") {
    return retypeProviderOutcome<T>(transport);
  }
  return parseResponse(transport.value.body);
}

async function fetchProviderSearchCandidates(
  providerId: ProviderId,
  title: string,
): Promise<ProviderOutcome<ProviderSearchCandidate[]>> {
  const adapter = getProviderAdapter(providerId);
  if (!adapter?.buildSearchRequest || !adapter.parseSearchResponse) {
    return {
      kind: "unsupported",
      providerId,
      message: "Provider does not expose an automated search adapter",
    };
  }
  return fetchAndParseProviderResponse(
    providerId,
    adapter.buildSearchRequest(title),
    adapter.parseSearchResponse,
  );
}

function pickBestProviderSearchCandidate(
  candidates: readonly ProviderSearchCandidate[],
  metadata: MangaBakaMetadata,
  rejectedUrls: readonly string[],
): ProviderSearchCandidate | null {
  const normalizedSourceTitles = metadata.titles.map(normalizeTitle).filter(Boolean);
  const rejectedUrlSet = new Set(rejectedUrls);
  let best: { candidate: ProviderSearchCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    if (rejectedUrlSet.has(candidate.url)) {
      continue;
    }
    const candidateTitles = dedupeTitles([candidate.title, ...candidate.aliases]);
    const score = Math.max(0, ...candidateTitles.map((title) => scoreTitleMatch(title, normalizedSourceTitles)));
    if (score < 90 || (best && score <= best.score)) {
      continue;
    }
    best = { candidate, score };
  }
  return best?.candidate ?? null;
}

function noProviderMatch(providerId: ProviderId, message = "No matching provider title was found"): ProviderSearchOutcome {
  return { kind: "no_match", providerId, message };
}

async function searchAtsumaru(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderSearchOutcome> {
  const title = metadata.titles[titleIndex];
  if (!title) {
    return noProviderMatch("atsu", "No title remains for this Atsumaru attempt");
  }

  const candidateOutcome = await fetchProviderSearchCandidates("atsu", title);
  if (candidateOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(candidateOutcome);
  }
  const bestMatch = pickBestProviderSearchCandidate(candidateOutcome.value, metadata, rejectedUrls);
  if (!bestMatch) {
    return noProviderMatch("atsu");
  }

  const latestChapterOutcome = bestMatch.seriesId
    ? await fetchAndParseProviderResponse(
        "atsu",
        buildAtsumaruMangaPageRequest(bestMatch.seriesId),
        parseAtsumaruLatestChapterResponse,
      )
    : null;

  return {
    kind: "found",
    providerId: "atsu",
    value: {
      provider: "Atsumaru",
      title: bestMatch.title,
      url: bestMatch.url,
      latestChapterNumber: latestChapterOutcome?.kind === "found" ? latestChapterOutcome.value.label : null,
      latestChapterLanguage: "en",
    },
  };
}

async function fetchAtsumaruLatestChapterNumber(mangaId: string): Promise<ProviderOutcome<string | null>> {
  const outcome = await fetchAndParseProviderResponse(
    "atsu",
    buildAtsumaruMangaPageRequest(mangaId),
    parseAtsumaruLatestChapterResponse,
  );
  if (outcome.kind === "found") {
    return { kind: "found", providerId: "atsu", value: outcome.value.label };
  }
  if (outcome.kind === "no_match") {
    return { kind: "found", providerId: "atsu", value: null };
  }
  return retypeProviderOutcome<string | null>(outcome);
}

async function searchMangaDex(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderSearchOutcome> {
  const title = metadata.titles[titleIndex];
  if (!title) {
    return noProviderMatch("mangadex", "No title remains for this MangaDex attempt");
  }

  const candidateOutcome = await fetchProviderSearchCandidates("mangadex", title);
  if (candidateOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(candidateOutcome);
  }
  const bestMatch = pickMangaDexSearchCandidate(candidateOutcome.value, metadata.titles, rejectedUrls);
  if (!bestMatch?.seriesId) {
    return noProviderMatch("mangadex");
  }

  const [feedOutcome, metadataOutcome] = await Promise.all([
    fetchAndParseProviderResponse(
      "mangadex",
      buildMangaDexChapterFeedRequest(bestMatch.seriesId),
      parseMangaDexChapterFeedResponse,
    ),
    fetchAndParseProviderResponse(
      "mangadex",
      buildMangaDexTitleMetadataRequest(bestMatch.seriesId),
      parseMangaDexTitleMetadataResponse,
    ),
  ]);
  if (feedOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(feedOutcome);
  }
  if (metadataOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(metadataOutcome);
  }

  const chapterAvailability = classifyMangaDexChapterAvailability(feedOutcome.value, metadataOutcome.value);
  return {
    kind: "found",
    providerId: "mangadex",
    value: {
      provider: "MangaDex",
      title: bestMatch.title,
      url: bestMatch.url,
      latestChapterNumber: chapterAvailability.latestChapterNumber,
      latestChapterLanguage: chapterAvailability.state === "available" ? "en" : null,
      mangaDexChapterState: chapterAvailability.state,
      manualPurgedChapterNumber: null,
      manualMangaDexChapterState: null,
    },
  };
}

async function refreshPendingMangaDexLookup(metadata: MangaBakaMetadata, generation: number): Promise<void> {
  const cached = currentCache;
  const mangaDexState = cached?.providers.mangadex as { lookupRevision?: number } | undefined;
  if (!cached || !currentSettings.enabledProviders.mangadex
    || cached.searchedProviders.mangadex
    || mangaDexState?.lookupRevision !== MANGADEX_LOOKUP_REVISION) {
    return;
  }

  const outcome = await searchMangaDex(metadata, cached.rejectedUrls.mangadex, cached.titleAttemptIndexes.mangadex);
  if (!isCurrentLookupGeneration(generation) || !currentCache) {
    return;
  }
  currentProviderSearchOutcomes.mangadex = outcome;
  currentCache = {
    ...currentCache,
    results: { ...currentCache.results, mangadex: outcome.kind === "found" ? outcome.value : null },
    searchedProviders: { ...currentCache.searchedProviders, mangadex: isStableProviderSearchOutcome(outcome) },
    searchedAt: new Date().toISOString(),
  };
  currentCachedResultFlags.mangadex = false;
}

async function fetchMangaDexLatestEnglishChapterInfo(
  mangaId: string,
): Promise<ProviderOutcome<Pick<ProviderMatch, "latestChapterNumber" | "latestChapterLanguage" | "mangaDexChapterState">>> {
  const [feedOutcome, metadataOutcome] = await Promise.all([
    fetchAndParseProviderResponse(
      "mangadex",
      buildMangaDexChapterFeedRequest(mangaId),
      parseMangaDexChapterFeedResponse,
    ),
    fetchAndParseProviderResponse(
      "mangadex",
      buildMangaDexTitleMetadataRequest(mangaId),
      parseMangaDexTitleMetadataResponse,
    ),
  ]);
  if (feedOutcome.kind !== "found") {
    return retypeProviderOutcome(feedOutcome);
  }
  if (metadataOutcome.kind !== "found") {
    return retypeProviderOutcome(metadataOutcome);
  }

  const availability = classifyMangaDexChapterAvailability(feedOutcome.value, metadataOutcome.value);
  return {
    kind: "found",
    providerId: "mangadex",
    value: {
      latestChapterNumber: availability.latestChapterNumber,
      latestChapterLanguage: availability.state === "available" ? "en" : null,
      mangaDexChapterState: availability.state,
    },
  };
}

async function searchEHentai(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
  providerKey: "ehentai" | "exhentai",
): Promise<ProviderSearchOutcome> {
  const title = metadata.titles[titleIndex];
  if (!title) {
    return noProviderMatch(providerKey, "No title remains for this provider attempt");
  }
  const candidateOutcome = await fetchProviderSearchCandidates(providerKey, title);
  if (candidateOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(candidateOutcome);
  }
  const bestMatch = pickBestProviderSearchCandidate(candidateOutcome.value, metadata, rejectedUrls);
  if (!bestMatch) {
    return noProviderMatch(providerKey);
  }

  return {
    kind: "found",
    providerId: providerKey,
    value: {
      provider: providerKey === "ehentai" ? "E-Hentai" : "ExHentai",
      title: bestMatch.title,
      url: bestMatch.url,
      latestChapterNumber: null,
      latestChapterLanguage: null,
    },
  };
}

async function searchMangaFire(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderSearchOutcome> {
  const title = metadata.titles[titleIndex];
  if (!title) {
    return noProviderMatch("mangafire", "No title remains for this MangaFire attempt");
  }
  const candidateOutcome = await fetchProviderSearchCandidates("mangafire", title);
  if (candidateOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(candidateOutcome);
  }
  const bestMatch = pickBestProviderSearchCandidate(candidateOutcome.value, metadata, rejectedUrls);
  return bestMatch
    ? {
        kind: "found",
        providerId: "mangafire",
        value: {
          provider: "MangaFire",
          title: bestMatch.title,
          url: bestMatch.url,
          latestChapterNumber: null,
          latestChapterLanguage: null,
        },
      }
    : noProviderMatch("mangafire");
}

async function searchWeebCentral(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderSearchOutcome> {
  const title = metadata.titles[titleIndex];
  if (!title) {
    return noProviderMatch("weebcentral", "No title remains for this WeebCentral attempt");
  }
  const candidateOutcome = await fetchProviderSearchCandidates("weebcentral", title);
  if (candidateOutcome.kind !== "found") {
    return retypeProviderOutcome<ProviderMatch>(candidateOutcome);
  }
  const bestMatch = pickBestProviderSearchCandidate(candidateOutcome.value, metadata, rejectedUrls);
  return bestMatch
    ? {
        kind: "found",
        providerId: "weebcentral",
        value: {
          provider: "WeebCentral",
          title: bestMatch.title,
          url: bestMatch.url,
          latestChapterNumber: null,
          latestChapterLanguage: null,
        },
      }
    : noProviderMatch("weebcentral");
}

function extractEHentaiSearchResults(html: string, domain: "e-hentai" | "exhentai"): EHentaiSearchResult[] {
  const seenUrls = new Set<string>();
  const results: EHentaiSearchResult[] = [];
  const pattern = new RegExp(
    `<a href="(https://${domain}\\.org/g/[^"]+/)"><div class="glink">([\\s\\S]*?)<\\/div>`,
    "gi",
  );
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const url = decodeHtmlText(match[1] ?? "");
    const title = stripHtml(match[2] ?? "");
    if (!url || !title || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    results.push({ url, title });
  }

  return results;
}

function canonicalizeEHentaiGalleryUrl(url: URL, domain: "e-hentai" | "exhentai"): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== `${domain}.org` || segments.length < 3 || segments[0] !== "g") {
    return null;
  }

  return `https://${domain}.org/g/${segments[1]}/${segments[2]}/`;
}

function cleanEHentaiGalleryTitle(title: string): string {
  return title
    .replace(/^\s*(\[[^]]+]\s*)+/, "")
    .replace(/\s*(\[[^]]+]\s*)+$/, "")
    .replace(/\s+\|\s+.+$/, "")
    .trim();
}

function extractEHentaiTitleCandidates(title: string): string[] {
  const cleanedTitle = cleanEHentaiGalleryTitle(title);
  return dedupeTitles([
    cleanedTitle,
    title,
  ]);
}

function buildEHentaiQueryTitles(titles: string[]): string[] {
  const queries: string[] = [];

  for (const title of titles) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      continue;
    }

    queries.push(trimmedTitle);
    queries.push(trimmedTitle.replace(/πr²/gi, "πr2"));
    queries.push(trimmedTitle.replace(/πr2/gi, "πr²"));

    const firstSegment = trimmedTitle.split(/\s*[|/:\-]\s*|\s{2,}/)[0]?.trim() ?? "";
    if (firstSegment) {
      queries.push(firstSegment);
    }

    const firstToken = trimmedTitle.split(/\s+/)[0]?.trim() ?? "";
    if (firstToken) {
      queries.push(firstToken.replace(/πr²/gi, "πr2"));
      queries.push(firstToken.replace(/πr2/gi, "πr²"));
    }
  }

  return dedupeTitles(queries);
}

function cleanWeebCentralResultTitle(title: string): string {
  return title.replace(/\s*\|\s*Weeb Central$/i, "").trim();
}

function getWeebCentralTitleFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length >= 3 ? hyphenatedTitleToText(segments[2]) : "";
}

function cleanMangaFireResultTitle(title: string): string {
  return title.replace(/\s+Manga\s+-\s+Read Manga Online Free$/i, "").trim();
}

function getMangaFireTitleFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return "";
  }

  return hyphenatedTitleToText(segments[1].replace(/\.[^.]+$/, ""));
}

function hyphenatedTitleToText(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function decodeHtmlText(value: string): string {
  if (!value) {
    return "";
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value.trim();
}

function stripHtml(value: string): string {
  return decodeHtmlText(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function pickBestCandidate<T extends { score: number }>(candidates: Map<string, T>): T | null {
  let bestCandidate: T | null = null;
  for (const candidate of candidates.values()) {
    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function getMangaDexTitles(entry: {
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
  };
}): string[] {
  const primaryTitle = entry.attributes?.title ? Object.values(entry.attributes.title)[0] ?? "" : "";
  const altTitles = entry.attributes?.altTitles?.flatMap((titleMap) => Object.values(titleMap)) ?? [];
  return dedupeTitles([primaryTitle, ...altTitles]);
}

function pickPreferredTitle(titles: string[]): string {
  const mixedCaseTitle = titles.find((title) => title !== title.toUpperCase());
  return mixedCaseTitle ?? titles[0] ?? "Untitled";
}

function scoreTitleMatch(candidateTitle: string, normalizedSourceTitles: string[]): number {
  const normalizedCandidate = normalizeTitle(candidateTitle);
  if (!normalizedCandidate) {
    return 0;
  }

  if (normalizedSourceTitles.includes(normalizedCandidate)) {
    return 100;
  }

  for (const sourceTitle of normalizedSourceTitles) {
    if (sourceTitle.includes(normalizedCandidate) || normalizedCandidate.includes(sourceTitle)) {
      return 95;
    }
  }

  const candidateTokens = new Set(normalizedCandidate.split(" "));
  let bestScore = 0;
  for (const sourceTitle of normalizedSourceTitles) {
    const sourceTokens = new Set(sourceTitle.split(" "));
    const sharedTokens = Array.from(candidateTokens).filter((token) => sourceTokens.has(token)).length;
    const overlapRatio = sharedTokens / Math.max(candidateTokens.size, sourceTokens.size, 1);
    if (overlapRatio >= 0.9) {
      bestScore = Math.max(bestScore, 90);
    } else if (overlapRatio >= 0.75) {
      bestScore = Math.max(bestScore, 75);
    }
  }

  return bestScore;
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyTitle(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, "-");
}

function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const title of titles) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      continue;
    }

    const normalizedTitle = normalizeTitle(trimmedTitle);
    if (!normalizedTitle || seen.has(normalizedTitle)) {
      continue;
    }

    seen.add(normalizedTitle);
    deduped.push(trimmedTitle);
  }

  return deduped;
}

function extractTitleCandidatesFromDocument(documentNode: Document): string[] {
  const candidates: string[] = [];
  const pageTitle = documentNode.title.replace(/\s+manga information$/i, "").trim();
  if (pageTitle) {
    const pageTitleMatch = pageTitle.match(/^(.+?)\s*\((.+)\)$/);
    if (pageTitleMatch) {
      candidates.push(pageTitleMatch[1], pageTitleMatch[2]);
    } else {
      candidates.push(pageTitle);
    }
  }

  const heading = documentNode.querySelector("h1");
  if (heading?.textContent) {
    candidates.push(heading.textContent);
  }

  const titleScopes = [heading?.parentElement, heading?.parentElement?.nextElementSibling].filter(
    (scope): scope is Element => Boolean(scope),
  );

  for (const scope of titleScopes) {
    const nodes = Array.from(
      scope.querySelectorAll("h1, h2, div[title], span[title], div.text-muted-foreground, span.text-muted-foreground"),
    );
    for (const node of nodes) {
      const text = node.textContent?.trim();
      if (text) {
        candidates.push(text);
      }

      if (node instanceof HTMLElement) {
        const titledText = node.getAttribute("title")?.trim();
        if (titledText) {
          candidates.push(titledText);
        }
      }
    }
  }

  return dedupeTitles(candidates);
}

function formatChapterNumber(value: number | string | null | undefined): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  return null;
}

function formatAtsumaruChapterLabel(title: string | null | undefined, number: number | string | null | undefined): string | null {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return null;
  }

  if (/^page\.\s*/i.test(trimmedTitle)) {
    const pageNumber = formatChapterNumber(number);
    return pageNumber ? `Page. ${pageNumber}` : trimmedTitle;
  }

  return null;
}

function toChapterSortValue(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : -1;
  }

  return -1;
}

async function getAlternatingInactiveTitleMarkup(): Promise<string> {
  const storageKey = "ui:inactiveTitleVariant";
  try {
    const stored = await chrome.storage.local.get(storageKey);
    const nextVariant = stored[storageKey] === "jp-first" ? "en-first" : "jp-first";
    await chrome.storage.local.set({ [storageKey]: nextVariant });

    return nextVariant === "jp-first"
      ? '<span class="brand-white">マンガ</span> <span class="brand-red">Baka</span>'
      : '<span class="brand-white">Manga</span> <span class="brand-red">バカ</span>';
  } catch {
    return currentInactiveTitleMarkup;
  }
}

async function ensureInactiveTitleMarkup(): Promise<void> {
  inactiveTitleMarkupPromise ??= getAlternatingInactiveTitleMarkup();
  currentInactiveTitleMarkup = await inactiveTitleMarkupPromise;
}

async function renderUnsupportedState(): Promise<void> {
  await ensureInactiveTitleMarkup();
  currentViewState = "unsupported";
  currentProviderPage = null;
  currentCachedResultFlags = {};
  getTitleNode().classList.add("title--inactive");
  getTitleNode().innerHTML = currentInactiveTitleMarkup;
  getSubtitleNode().innerHTML = "Search on a MangaBaka series page<br>https://mangabaka.org/*ID*";
  renderProviderRows(createEmptyLookupResults(), { emptyLabel: "N/A", enableProviderReset: false });
  setStatus("Inactive on this page", "error");
  setResetEnabled(false);
}

async function renderInvalidPageState(): Promise<void> {
  await ensureInactiveTitleMarkup();
  currentViewState = "invalid";
  currentProviderPage = null;
  currentCachedResultFlags = {};
  getTitleNode().classList.add("title--inactive");
  getTitleNode().innerHTML = currentInactiveTitleMarkup;
  getSubtitleNode().textContent = "This URL does not correspond to a real MangaBaka series.";
  renderProviderRows(createEmptyLookupResults(), { emptyLabel: "N/A", enableProviderReset: false });
  setStatus("No search was run for this page", "error");
  setResetEnabled(false);
}

function renderLoadingState(): void {
  currentViewState = "loading";
  currentProviderPage = null;
  currentCachedResultFlags = {};
  setResetEnabled(false);
  clearPendingConfirmation();
  const resultsNode = getResultsNode();
  resultsNode.innerHTML = "";

  for (const provider of getVisibleProviders()) {
    const row = document.createElement("div");
    row.className = "provider-row provider-row--loading";

    const label = buildProviderLabel(provider.key, getProviderDisplayLabel(provider.key));

    const value = document.createElement("div");
    value.className = "provider-value";
    value.innerHTML = `
      <div class="provider-value-main">Searching...</div>
      <div class="provider-value-meta">Checking latest chapter...</div>
    `;

    const actions = document.createElement("div");
    actions.className = "provider-actions";

    row.append(label, value, actions);
    resultsNode.appendChild(row);
  }
}

function renderLookup(cache: CachedLookup, fromCache: boolean): void {
  currentViewState = "lookup";
  currentProviderPage = null;
  getTitleNode().classList.remove("title--inactive");
  getTitleNode().textContent = resolveCachedDisplayTitle(cache);

  getSubtitleNode().textContent = cache.series.authors[0] ? `by ${cache.series.authors[0]}` : "";
  renderProviderRows(cache.results, {
    cache,
    emptyLabel: "No Match Found",
    enableProviderReset: true,
  });
  const enabledProviderIds = getVisibleProviders().map((provider) => provider.key as ProviderId);
  const presentation = getPopupStatusPresentation({
    kind: "lookup",
    enabledProviderIds,
    outcomes: currentProviderSearchOutcomes,
    fromCache,
  });
  setStatus(presentation.message, presentation.tone);
  setResetEnabled(true);
}

function getProviderPageSubtitle(pageType: ProviderPageContext["pageType"]): string {
  switch (pageType) {
    case "series":
      return "Series Page";
    case "chapter":
      return "Chapter Page";
    default:
      return "Provider Page";
  }
}

function withIndefiniteArticle(label: ProviderMatch["provider"]): string {
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

async function renderProviderPageState(context: ProviderPageContext): Promise<void> {
  if (!currentSettings.enabledProviders[context.providerKey]) {
    await renderUnsupportedState();
    return;
  }

  currentViewState = "provider";
  currentProviderPage = context;
  currentCachedResultFlags = {};
  getTitleNode().classList.remove("title--inactive");
  getTitleNode().textContent = context.isSearchable ? context.primaryTitle : context.providerLabel;
  getSubtitleNode().textContent = getProviderPageSubtitle(context.pageType);
  renderProviderSearchRows(context);
  setStatus(
    context.isSearchable
      ? `Ready to search MangaBaka from ${context.providerLabel}`
      : context.pageType == null
        ? `Open ${withIndefiniteArticle(context.providerLabel)} series or chapter page to search MangaBaka`
        : `Unable to read the ${context.providerLabel} title on this page`,
    context.isSearchable ? "success" : context.pageType == null ? "idle" : "error",
  );
  setResetEnabled(false);
}

function renderProviderSearchRows(context: ProviderPageContext): void {
  clearPendingConfirmation();
  const resultsNode = getResultsNode();
  resultsNode.innerHTML = "";

  for (const provider of getVisibleProviders()) {
    const row = document.createElement("div");
    row.className = "provider-row";

    const label = buildProviderLabel(provider.key, getProviderDisplayLabel(provider.key));

    const value = document.createElement("div");
    value.className = "provider-value";

    const main = document.createElement("div");
    main.className = "provider-value-main";

    const meta = document.createElement("div");
    meta.className = "provider-value-meta";

    const actions = document.createElement("div");
    actions.className = "provider-actions";

    if (provider.key === context.providerKey) {
      main.textContent = context.isSearchable
        ? context.primaryTitle
        : context.pageType === null
          ? ""
          : "Title unavailable";
      meta.textContent = context.isSearchable
        ? "Current series title"
        : context.pageType === null
          ? ""
          : "Unable to read a searchable title";

      const searchButton = buildTextActionButton(
        "action-button action-button--search",
        "Search MangaBaka",
        context.isSearchable
          ? `Search MangaBaka for ${context.primaryTitle} in ${currentSettings.searchLinkType === "new" ? "a new tab" : "the current tab"}`
          : "Search MangaBaka is only available on supported series and chapter pages",
        !context.isSearchable,
        () => {
          if (!context.isSearchable) {
            return;
          }

          runPopupTask(
            () => openMangaBakaSearch(context.primaryTitle),
            "Unable to search MangaBaka.",
          );
        },
      );
      actions.append(searchButton);
    } else {
      value.classList.add("provider-value--na");
      main.textContent = "N/A";
      meta.textContent = "";
    }

    value.append(main, meta);
    row.append(label, value, actions);
    resultsNode.appendChild(row);
  }
}

function renderProviderRows(
  results: LookupResults,
  options: { cache?: CachedLookup | null; emptyLabel: string; enableProviderReset: boolean },
): void {
  clearPendingConfirmation();
  const resultsNode = getResultsNode();
  resultsNode.innerHTML = "";

  for (const provider of getVisibleProviders()) {
    const providerResult = results[provider.key];
    const providerLabel = getProviderDisplayLabel(provider.key);
    const providerEnabled = currentSettings.enabledProviders[provider.key];
    const providerSearched = options.cache?.searchedProviders?.[provider.key] ?? false;
    const shouldShowRefreshButton =
      Boolean(providerResult)
      && currentViewState === "lookup"
      && currentCachedResultFlags[provider.key] === true;
    const providerBusy = metadataRefreshInProgress || providerActionsInProgress[provider.key] === true;
    const retryBusy = retryInProgress[provider.key] === true || providerBusy;
    const canSearchNow = Boolean(options.cache) && providerEnabled && !providerSearched && !providerResult && !providerBusy;
    const attemptIndex = options.cache?.titleAttemptIndexes?.[provider.key] ?? 0;
    const titleCount = options.cache?.series.rankedSearchTitles.length ?? 0;
    const searchOutcome = currentProviderSearchOutcomes[provider.key];
    const manualSearchTitle = options.cache?.series.rankedSearchTitles[attemptIndex]
      ?? options.cache?.series.rankedSearchTitles[0]
      ?? "";
    const providerAdapter = getProviderAdapter(provider.key as ProviderId);
    const hasTransientOutcome = searchOutcome != null && !isStableProviderSearchOutcome(searchOutcome);
    const shouldOfferManualSearch = hasTransientOutcome && searchOutcome.kind !== "unsupported";
    const manualSearchUrl = shouldOfferManualSearch && providerAdapter?.buildManualSearchUrl
      ? providerAdapter.buildManualSearchUrl(manualSearchTitle)
      : null;
    const hasNextTitle = attemptIndex < titleCount - 1;
    const isExhausted =
      providerSearched && !providerResult && providerEnabled && titleCount > 0 && !hasNextTitle && attemptIndex > 0 && options.emptyLabel === "No Match Found";
    const row = document.createElement("div");
    row.className = "provider-row";

    const label = buildProviderLabel(provider.key, providerLabel);

    const value = document.createElement("div");
    value.className = "provider-value";
    if (!providerResult) {
      value.classList.add("provider-value--na");
    }

    const main = document.createElement("div");
    main.className = "provider-value-main";
    if (!providerEnabled) {
      main.textContent = "N/A";
    } else if (providerResult) {
      main.textContent = providerResult.title;
    } else if (manualSearchUrl) {
      main.textContent = "Manual search available";
    } else if (hasTransientOutcome) {
      main.textContent = "Automated search unavailable";
    } else if (canSearchNow) {
      main.textContent = "Ready to search";
    } else if (isExhausted) {
      main.textContent = "All attempts exhausted";
    } else {
      main.textContent = options.emptyLabel;
    }

    const meta = document.createElement("div");
    meta.className = "provider-value-meta";
    const mangaDexChapterState = provider.key === "mangadex" ? getMangaDexChapterState(providerResult) : null;
    if (provider.key === "mangadex" && providerResult) {
      if (mangaDexChapterState === "available") {
        const latestLabel = providerResult.latestChapterNumber
          ? `Ch. ${providerResult.latestChapterNumber.replace(/^page\.\s*/i, "")}`
          : "English chapters available";
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>${escapeHtml(latestLabel)}</span>`;
      } else if (mangaDexChapterState === "no_chapters_tld") {
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>No Chapters TL'd</span>`;
      } else {
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>Purged</span>`;
        meta.append(createStatusIconSvg("provider-value-status-icon", "pensive"));
      }

      if (canToggleMangaDexChapterState(providerResult)) {
        meta.onclick = () => {
          runPopupTask(
            () => toggleMangaDexPurgedState(),
            "Unable to update the MangaDex chapter state.",
          );
        };
      }
    } else if (providerResult?.latestChapterNumber) {
      const latestLabel = `Ch. ${providerResult.latestChapterNumber.replace(/^page\.\s*/i, "")}`;
      meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>${escapeHtml(latestLabel)}</span>`;
    } else if (providerResult) {
      meta.textContent = "";
    } else if (!providerEnabled) {
      meta.textContent = "Disabled";
    } else if (hasTransientOutcome && searchOutcome) {
      switch (searchOutcome.kind) {
        case "blocked":
          meta.textContent = "Automated search blocked";
          break;
        case "rate_limited":
          meta.textContent = "Provider rate limited";
          break;
        case "auth_required":
          meta.textContent = "Provider sign-in required";
          break;
        case "unavailable":
          meta.textContent = searchOutcome.reason === "timeout" ? "Provider timed out" : "Provider unavailable";
          break;
        case "error":
          meta.textContent = "Provider response changed";
          break;
        default:
          meta.textContent = "Automated search unavailable";
          break;
      }
    } else if (canSearchNow) {
      meta.textContent = "";
    } else if (titleCount > 0) {
      meta.textContent = `Title ${Math.min(attemptIndex + 1, titleCount)} of ${titleCount} tried`;
    } else {
      meta.textContent = "";
    }

    value.append(main, meta);

    const actions = document.createElement("div");
    actions.className = "provider-actions";
    const isReadLinkSaveArmed = providerResult ? armedReadLinkSaves[provider.key] === providerResult.url : false;
    const isReadLinkSaveBusy = readLinkSaveInProgress === provider.key;

    const copyButton = buildActionButton(
      isReadLinkSaveArmed ? "icon-button icon-button--save-read-link" : "icon-button",
      isReadLinkSaveArmed ? SAVE_READ_LINK_ICON : COPY_ICON,
      providerResult
        ? isReadLinkSaveBusy
          ? `Saving ${providerLabel} as MangaBaka Read Link`
          : isReadLinkSaveArmed
          ? `Save ${providerLabel} as MangaBaka Read Link`
          : `Copy ${providerLabel} link`
        : `${providerLabel} unavailable`,
      !providerResult || isReadLinkSaveBusy || readLinkSaveInProgress != null,
      () => {
        if (!providerResult || readLinkSaveInProgress != null) {
          return;
        }

        if (isReadLinkSaveArmed) {
          runPopupTask(
            () => saveReadLink(provider.key, providerResult.url, providerLabel),
            `Unable to save the ${providerLabel} Read Link.`,
          );
          return;
        }

        runPopupTask(
          () => copyLink(provider.key, providerResult.url, providerLabel),
          `Unable to copy the ${providerLabel} link.`,
        );
      },
    );

    const openButton = buildActionButton(
      "icon-button",
      OPEN_ICON,
      providerResult
        ? `Open ${providerLabel} in ${currentSettings.searchLinkType === "new" ? "a new tab" : "the current tab"}`
        : `${providerLabel} unavailable`,
      !providerResult,
      () => {
        if (!providerResult) {
          return;
        }

        runPopupTask(
          () => openProviderUrl(providerResult.url, providerLabel),
          `Unable to open ${providerLabel}.`,
        );
      },
    );

    const retryButton = buildActionButton(
      "icon-button icon-button--retry",
      RETRY_ICON,
      providerResult ? `${providerLabel} already has a result` : hasNextTitle ? `Try the next available title for ${providerLabel}` : "All attempts exhausted",
      Boolean(providerResult) || !providerEnabled || !providerSearched || !hasNextTitle || retryBusy,
      () => {
        if (providerResult || !providerEnabled || !providerSearched || !hasNextTitle || retryBusy) {
          return;
        }

        runPopupTask(
          () => handleProviderRetry(provider.key),
          `Unable to retry ${providerLabel}.`,
        );
      },
    );

    const searchNowButton = buildTextActionButton(
      "action-button action-button--search",
      "Search Now",
      `Search ${providerLabel} now`,
      !canSearchNow,
      () => {
        if (!canSearchNow) {
          return;
        }

        runPopupTask(
          () => handleProviderSearchNow(provider.key),
          `Unable to search ${providerLabel}.`,
        );
      },
    );

    const manualSearchButton = buildTextActionButton(
      "action-button action-button--search",
      "Open Search",
      `Open ${providerLabel} manual search`,
      !manualSearchUrl,
      () => {
        if (manualSearchUrl) {
          runPopupTask(
            () => openProviderUrl(manualSearchUrl, `${providerLabel} search`),
            `Unable to open the ${providerLabel} search.`,
          );
        }
      },
    );

    const incorrectButton = buildActionButton(
      "icon-button icon-button--reset",
      INCORRECT_ICON,
      providerResult ? `Mark the current ${providerLabel} result incorrect and search again` : `${providerLabel} unavailable`,
      !providerResult || !options.enableProviderReset || !providerEnabled || providerBusy,
      (button) => {
        if (!providerResult || !options.enableProviderReset || !providerEnabled || providerBusy) {
          return;
        }

        requestInlineConfirmation(button, `Press the same X button again to exclude this ${providerLabel} result.`, () =>
          handleProviderReset(provider.key),
        );
      },
    );

    const refreshButton = buildActionButton(
      "icon-button",
      RESET_ICON,
      providerResult ? `Refresh the cached ${providerLabel} result` : `${providerLabel} unavailable`,
      !providerResult || !shouldShowRefreshButton || providerBusy,
      () => {
        if (!providerResult || !shouldShowRefreshButton || providerBusy) {
          return;
        }

        runPopupTask(
          () => handleProviderRefresh(provider.key),
          `Unable to refresh ${providerLabel}.`,
        );
      },
    );

    if (providerResult) {
      actions.append(
        copyButton,
        openButton,
        manualSearchUrl ? manualSearchButton : shouldShowRefreshButton ? refreshButton : incorrectButton,
      );
    } else if (manualSearchUrl) {
      actions.append(manualSearchButton);
    } else if (canSearchNow) {
      actions.append(searchNowButton);
    } else if (providerEnabled && providerSearched) {
      actions.append(retryButton);
    }
    row.append(label, value, actions);
    resultsNode.appendChild(row);
  }
}

function buildActionButton(
  className: string,
  iconMarkup: string,
  title: string,
  disabled: boolean,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = iconMarkup;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    onClick(button);
  });
  return button;
}

function buildTextActionButton(
  className: string,
  label: string,
  title: string,
  disabled: boolean,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    onClick(button);
  });
  return button;
}

function rerenderCurrentResultsOnly(): void {
  if (!currentCache) {
    return;
  }

  renderProviderRows(currentCache.results, {
    cache: currentCache,
    emptyLabel: "No Match Found",
    enableProviderReset: true,
  });
}

function getProviderLabelMarkup(providerKey: ProviderKey, label: string): string {
  const iconMarkup = `<img class="provider-label-logo" src="${escapeHtml(getProviderIconPath(providerKey))}" alt="" />`;
  const titleMarkup = `<span class="provider-label-text">${escapeHtml(label)}</span>`;

  switch (currentSettings.providerLabelMode) {
    case "icons":
      return iconMarkup;
    case "stacked":
      return `${titleMarkup}${iconMarkup}`;
    case "titles":
    default:
      return titleMarkup;
  }
}

function buildProviderLabel(providerKey: ProviderKey, label: string): HTMLAnchorElement {
  const adapter = getProviderAdapter(providerKey);
  if (!adapter) {
    throw new Error(`Missing provider adapter for ${providerKey}`);
  }
  const homepageUrl = adapter.homepageUrl;
  const link = document.createElement("a");
  link.className = `provider-label provider-label--${currentSettings.providerLabelMode} provider-label--link`;
  link.href = homepageUrl;
  link.target = currentSettings.providerLinkType === "new" ? "_blank" : "_self";
  link.rel = "noopener noreferrer";
  link.title = `Open ${label} homepage in ${currentSettings.providerLinkType === "new" ? "a new tab" : "the current tab"}`;
  link.setAttribute("aria-label", link.title);
  link.innerHTML = getProviderLabelMarkup(providerKey, label);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    runPopupTask(
      () => openProviderHomepage(providerKey, label),
      `Unable to open ${label}.`,
    );
  });
  return link;
}

function getProviderIconPath(providerKey: ProviderKey): string {
  const filename = __ADULT_PROVIDERS_ENABLED__ && providerKey === "exhentai" ? "ehentai" : providerKey;
  return chrome.runtime.getURL(`assets/providers/${filename}.${PROVIDER_ICON_EXTENSIONS[providerKey]}`);
}

function getProviderDisplayLabel(providerKey: ProviderKey): string {
  return PROVIDER_LABELS[providerKey] ?? providerKey;
}

function getVisibleProviders(): Array<{ key: ProviderKey; label: ProviderMatch["provider"] }> {
  return VISIBLE_PROVIDER_KEYS.filter((providerKey) => currentSettings.enabledProviders[providerKey]).map((providerKey) => ({
    key: providerKey,
    label: PROVIDER_LABELS[providerKey],
  }));
}

function renderErrorState(message: string): void {
  currentViewState = "error";
  currentErrorMessage = message;
  currentProviderPage = null;
  currentCachedResultFlags = {};
  getTitleNode().classList.remove("title--inactive");
  getTitleNode().textContent = "Search failed";
  getSubtitleNode().textContent = message;
  renderProviderRows(createEmptyLookupResults(), { emptyLabel: "N/A", enableProviderReset: false });
  setStatus("Unable to complete the lookup", "error");
  setResetEnabled(false);
}

async function rerenderCurrentView(): Promise<void> {
  switch (currentViewState) {
    case "unsupported":
      await renderUnsupportedState();
      return;
    case "invalid":
      await renderInvalidPageState();
      return;
    case "loading":
      renderLoadingState();
      return;
    case "lookup":
      if (currentCache) {
        renderLookup(currentCache, true);
      }
      return;
    case "provider":
      if (currentProviderPage && currentSettings.enabledProviders[currentProviderPage.providerKey]) {
        await renderProviderPageState(currentProviderPage);
      } else {
        await renderUnsupportedState();
      }
      return;
    case "error":
    default:
      renderErrorState(currentErrorMessage);
  }
}

async function openProviderUrl(url: string, providerLabel: string): Promise<void> {
  try {
    await openUrlWithPreference(url, currentSettings.searchLinkType);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : `Unable to open ${providerLabel}`, "error");
  }
}

async function openProviderHomepage(providerKey: ProviderKey, providerLabel: string): Promise<void> {
  try {
    const homepageUrl = getProviderAdapter(providerKey)?.homepageUrl;
    if (!homepageUrl) {
      throw new Error(`${providerLabel} homepage is unavailable.`);
    }
    await openUrlWithPreference(homepageUrl, currentSettings.providerLinkType);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : `Unable to open ${providerLabel}`, "error");
  }
}

async function openMangaBakaSearch(title: string): Promise<void> {
  try {
    await openUrlWithPreference(buildMangaBakaManualSearchUrl(title), currentSettings.searchLinkType);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to search MangaBaka", "error");
  }
}

async function handleProviderRefresh(providerKey: ProviderKey, generation?: number): Promise<void> {
  if (generation == null) {
    await queueProviderAction(providerKey, (queuedGeneration) => handleProviderRefresh(providerKey, queuedGeneration));
    return;
  }

  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  if (!currentCache || currentViewState !== "lookup" || currentCachedResultFlags[providerKey] !== true) {
    return;
  }

  const currentResult = currentCache.results[providerKey];
  if (!currentResult) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  setStatus(`Refreshing cached ${providerLabel} result...`, "loading");

  const { status, document } = await fetchProviderDocumentWithStatus(currentResult.url);
  if (!isCurrentLookupGeneration(generation) || !currentCache) {
    return;
  }
  if (!document) {
    if (status === 404 || status === 410) {
      const updatedCache: CachedLookup = {
        ...currentCache,
        rejectedUrls: {
          ...currentCache.rejectedUrls,
          [providerKey]: [],
        },
        titleAttemptIndexes: {
          ...currentCache.titleAttemptIndexes,
          [providerKey]: 0,
        },
        searchedProviders: {
          ...currentCache.searchedProviders,
          [providerKey]: false,
        },
        results: {
          ...currentCache.results,
          [providerKey]: null,
        },
        searchedAt: new Date().toISOString(),
      };

      delete armedReadLinkSaves[providerKey];
      delete currentCachedResultFlags[providerKey];
      await saveCache(updatedCache);
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      currentCache = updatedCache;
      rerenderCurrentResultsOnly();
      setStatus(`${providerLabel} URL no longer works. Search again to refresh it.`, "error");
      return;
    }

    setStatus(
      typeof status === "number" ? `Unable to refresh ${providerLabel} (${status})` : `Unable to refresh ${providerLabel}`,
      "error",
    );
    return;
  }

  let refreshedMetadata: ExtractedMetadataPayload | null;
  switch (providerKey) {
    case "atsu":
      refreshedMetadata = extractAtsumaruProviderPageMetadataFromDocument(document);
      break;
    case "mangadex":
      refreshedMetadata = await fetchMangaDexProviderPageMetadata(currentResult.url, "series");
      break;
    case "mangafire":
      refreshedMetadata = extractMangaFireProviderPageMetadataFromDocument(currentResult.url, document);
      break;
    case "weebcentral":
      refreshedMetadata = extractWeebCentralProviderPageMetadataFromDocument(currentResult.url, "series", document);
      break;
    default:
      refreshedMetadata = extractGenericProviderPageMetadataFromDocument(providerKey, document);
      break;
  }
  if (!isCurrentLookupGeneration(generation) || !currentCache) {
    return;
  }

  let latestChapterNumber = currentResult.latestChapterNumber;
  let latestChapterLanguage = currentResult.latestChapterLanguage;
  let mangaDexChapterState = currentResult.mangaDexChapterState ?? null;
  if (providerKey === "atsu") {
    const mangaId = getAtsumaruMangaIdFromUrl(currentResult.url);
    if (mangaId) {
      const latestChapterOutcome = await fetchAtsumaruLatestChapterNumber(mangaId);
      if (!isCurrentLookupGeneration(generation) || !currentCache) {
        return;
      }
      if (latestChapterOutcome.kind !== "found") {
        currentProviderSearchOutcomes.atsu = retypeProviderOutcome(latestChapterOutcome);
        showProviderSearchOutcome(providerLabel, retypeProviderOutcome(latestChapterOutcome));
        return;
      }
      latestChapterNumber = latestChapterOutcome.value;
      latestChapterLanguage = "en";
    }
  } else if (providerKey === "mangadex") {
    const mangaId = getMangaDexMangaIdFromUrl(currentResult.url);
    if (mangaId) {
      const latestEnglishChapterOutcome = await fetchMangaDexLatestEnglishChapterInfo(mangaId);
      if (!isCurrentLookupGeneration(generation) || !currentCache) {
        return;
      }
      if (latestEnglishChapterOutcome.kind !== "found") {
        currentProviderSearchOutcomes.mangadex = retypeProviderOutcome(latestEnglishChapterOutcome);
        setStatus(latestEnglishChapterOutcome.message ?? "MangaDex chapter status is unavailable", "error");
        return;
      }
      latestChapterNumber = latestEnglishChapterOutcome.value.latestChapterNumber;
      latestChapterLanguage = latestEnglishChapterOutcome.value.latestChapterLanguage;
      mangaDexChapterState = latestEnglishChapterOutcome.value.mangaDexChapterState ?? null;
    }
  }

  const title = refreshedMetadata?.titles.length
    ? providerKey === "mangadex" ? refreshedMetadata.titles[0] : pickPreferredTitle(refreshedMetadata.titles)
    : currentResult.title;
  const updatedResult: ProviderMatch = {
    ...currentResult,
    title,
    latestChapterNumber,
    latestChapterLanguage,
    ...(providerKey === "mangadex"
      ? {
          mangaDexChapterState,
          manualPurgedChapterNumber: null,
          manualMangaDexChapterState: null,
        }
      : {}),
  };
  const changed =
    updatedResult.title !== currentResult.title
    || updatedResult.latestChapterNumber !== currentResult.latestChapterNumber
    || updatedResult.latestChapterLanguage !== currentResult.latestChapterLanguage
    || (
      providerKey === "mangadex"
      && (
        updatedResult.mangaDexChapterState !== currentResult.mangaDexChapterState
        || Boolean(currentResult.manualPurgedChapterNumber)
        || Boolean(currentResult.manualMangaDexChapterState)
      )
    );

  const updatedCache: CachedLookup = {
    ...currentCache,
    results: {
      ...currentCache.results,
      [providerKey]: updatedResult,
    },
    searchedAt: new Date().toISOString(),
  };

  currentCachedResultFlags[providerKey] = true;
  await saveCache(updatedCache);
  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  currentCache = updatedCache;
  rerenderCurrentResultsOnly();
  setStatus(changed ? `Updated cached ${providerLabel} result` : `No changes found for ${providerLabel}`, "success");
}

async function copyLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    setStatus(`Unable to copy ${providerLabel} link`, "error");
    return;
  }
  armedReadLinkSaves = { [providerKey]: url };
  rerenderCurrentResultsOnly();
  setStatus(`${providerLabel} link copied`, "success");
}

async function toggleMangaDexPurgedState(generation?: number): Promise<void> {
  if (generation == null) {
    await queueProviderAction("mangadex", (queuedGeneration) => toggleMangaDexPurgedState(queuedGeneration));
    return;
  }

  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  if (!currentCache) {
    return;
  }

  const currentResult = currentCache.results.mangadex;
  if (!currentResult || currentResult.provider !== "MangaDex" || !canToggleMangaDexChapterState(currentResult)) {
    return;
  }

  const mangaDexResult = currentResult;
  const mangaDexChapterState = getMangaDexChapterState(mangaDexResult);
  const baseMangaDexChapterState = mangaDexResult.mangaDexChapterState ?? "purged";
  let updatedResult: ProviderMatch;
  let statusMessage: string;

  if (mangaDexChapterState === "available" && !mangaDexResult.latestChapterNumber) {
    updatedResult = {
      ...mangaDexResult,
      manualMangaDexChapterState: "purged",
    };
    statusMessage = "MangaDex marked as purged";
  } else if (mangaDexChapterState === "available" && mangaDexResult.latestChapterNumber) {
    updatedResult = {
      ...mangaDexResult,
      manualPurgedChapterNumber: mangaDexResult.latestChapterNumber,
      latestChapterNumber: null,
      mangaDexChapterState: "purged",
      manualMangaDexChapterState: null,
    };
    statusMessage = "MangaDex marked as purged";
  } else if (isManuallyPurgedMangaDexResult(mangaDexResult)) {
    updatedResult = {
      ...mangaDexResult,
      latestChapterNumber: mangaDexResult.manualPurgedChapterNumber ?? null,
      manualPurgedChapterNumber: null,
      mangaDexChapterState: "available",
      manualMangaDexChapterState: null,
    };
    statusMessage = "MangaDex purge cleared";
  } else if (mangaDexChapterState === "no_chapters_tld") {
    updatedResult = {
      ...mangaDexResult,
      manualMangaDexChapterState: baseMangaDexChapterState === "purged" ? null : "purged",
    };
    statusMessage = "MangaDex marked as purged";
  } else if (mangaDexChapterState === "purged") {
    updatedResult = {
      ...mangaDexResult,
      manualMangaDexChapterState: baseMangaDexChapterState === "available" || baseMangaDexChapterState === "no_chapters_tld"
        ? null
        : "no_chapters_tld",
    };
    statusMessage = baseMangaDexChapterState === "available"
      ? "MangaDex purge cleared"
      : "MangaDex marked as having no translated chapters";
  } else {
    return;
  }

  const updatedCache: CachedLookup = {
    ...currentCache,
    results: {
      ...currentCache.results,
      mangadex: updatedResult,
    },
    searchedAt: new Date().toISOString(),
  };

  await saveCache(updatedCache);
  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  currentCache = updatedCache;
  rerenderCurrentResultsOnly();
  setStatus(statusMessage, "success");
}

async function saveReadLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  if (readLinkSaveInProgress != null) {
    return;
  }

  readLinkSaveInProgress = providerKey;
  rerenderCurrentResultsOnly();
  setStatus(`Saving ${providerLabel} as Read Link...`, "loading");
  try {
    const tabId = await resolveUsableTabId();
    const seriesLocation = parseMangaBakaSeriesUrl(currentSourceUrl);
    if (tabId == null || !seriesLocation) {
      setStatus("No active MangaBaka series tab available", "error");
      return;
    }
    const cachedSeries = currentCache?.series;
    if (
      !cachedSeries
      || (
        seriesLocation.seriesId !== cachedSeries.requestedSeriesId
        && seriesLocation.seriesId !== cachedSeries.id
      )
    ) {
      setStatus("The active MangaBaka series no longer matches this lookup.", "error");
      return;
    }

    const client = await getPageContextClient(tabId);
    const result = await client.setReadLink(seriesLocation.seriesId, url);
    if (!result.ok) {
      setStatus("error" in result ? result.error.message : "Unable to save MangaBaka Read Link.", "error");
      return;
    }

    delete armedReadLinkSaves[providerKey];
    rerenderCurrentResultsOnly();
    setStatus(`${providerLabel} saved as MangaBaka Read Link`, "success");
  } catch (error) {
    if (isPopupMissingTabError(error)) {
      currentTabId = null;
      setStatus("The active MangaBaka tab is no longer available.", "error");
      return;
    }
    setStatus(error instanceof Error ? error.message : "Unable to save MangaBaka Read Link", "error");
  } finally {
    readLinkSaveInProgress = null;
    rerenderCurrentResultsOnly();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function wireTopResetButton(seriesId: string): void {
  getResetButton().title = "Reset cached search";
  getResetButton().setAttribute("aria-label", "Reset cached search");
  getResetButton().onclick = () => {
    requestInlineConfirmation(
      getResetButton(),
      "Press the top-right reset button again to clear the cache and all excluded results.",
      () => handleTopReset(seriesId),
    );
    scrollPopupToBottom();
  };
}

function wireLookupRetryButton(seriesId: string): void {
  setResetEnabled(true);
  getResetButton().title = "Retry MangaBaka metadata lookup";
  getResetButton().setAttribute("aria-label", "Retry MangaBaka metadata lookup");
  getResetButton().onclick = () => {
    runPopupTask(
      () => runLookup(
        currentSourceUrl,
        seriesId,
        createEmptyRejectedProviderUrls(),
        { ...EMPTY_TITLE_ATTEMPT_INDEXES },
      ),
      "Unable to retry the MangaBaka lookup.",
    );
  };
}

function wireCachedMetadataRetryButton(seriesId: string): void {
  setResetEnabled(true);
  getResetButton().title = "Retry MangaBaka metadata refresh";
  getResetButton().setAttribute("aria-label", "Retry MangaBaka metadata refresh");
  getResetButton().onclick = () => {
    runPopupTask(
      () => retryCachedMetadataRefresh(seriesId),
      "Unable to refresh the cached MangaBaka metadata.",
    );
  };
}

async function retryCachedMetadataRefresh(seriesId: string): Promise<void> {
  const cachedLookup = currentCache;
  if (!cachedLookup) {
    return;
  }

  const generation = beginLookupGeneration();
  metadataRefreshInProgress = true;
  setResetEnabled(false);
  rerenderCurrentResultsOnly();
  const retryPresentation = getPopupStatusPresentation({ kind: "retry" });
  setStatus(retryPresentation.message, retryPresentation.tone);
  try {
    await providerActionQueue.catch(() => undefined);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    const refreshedMetadata = await fetchMangaBakaMetadata(currentSourceUrl, seriesId);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    if (shouldInvalidateProviderResults(cachedLookup.series, refreshedMetadata.apiSeries.titles)) {
      await queueCacheMutation(async () => {
        if (isCurrentLookupGeneration(generation)) {
          await persistMetadataOnlyInvalidation(refreshedMetadata);
        }
      });
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      metadataRefreshInProgress = false;
      await runLookup(
        refreshedMetadata.sourceUrl,
        seriesId,
        createEmptyRejectedProviderUrls(),
        { ...EMPTY_TITLE_ATTEMPT_INDEXES },
        refreshedMetadata,
      );
      return;
    }

    await queueCacheMutation(async () => {
      if (!isCurrentLookupGeneration(generation) || !currentCache) {
        return;
      }
      const refreshedCache: CachedLookup = {
        ...currentCache,
        series: createCachedSeries(refreshedMetadata),
      };
      await saveCache(refreshedCache);
      if (isCurrentLookupGeneration(generation)) {
        currentCache = refreshedCache;
      }
    });
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    metadataRefreshInProgress = false;
    if (currentCache) {
      renderLookup(currentCache, true);
    }
    setStatus("MangaBaka metadata refreshed; cached provider results retained", "success");
    wireTopResetButton(seriesId);
  } catch (error) {
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    if (error instanceof InvalidMangaBakaPageError) {
      await queueCacheMutation(async () => {
        if (!isCurrentLookupGeneration(generation)) {
          return;
        }
        await clearCache(seriesId);
        if (isCurrentLookupGeneration(generation)) {
          currentCache = null;
        }
      });
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      metadataRefreshInProgress = false;
      await renderInvalidPageState();
      return;
    }

    metadataRefreshInProgress = false;
    if (currentCache) {
      renderLookup(currentCache, true);
    } else {
      renderLookup(cachedLookup, true);
    }
    setStatus("Loaded cached API metadata; MangaBaka refresh failed. Retry is available.", "error");
    wireCachedMetadataRetryButton(seriesId);
  } finally {
    if (isCurrentLookupGeneration(generation) && metadataRefreshInProgress) {
      metadataRefreshInProgress = false;
      if (currentViewState === "lookup") {
        rerenderCurrentResultsOnly();
      }
    }
  }
}

async function handleTopReset(seriesId: string): Promise<void> {
  const generation = invalidateLookupGeneration();
  metadataRefreshInProgress = false;
  setResetEnabled(false);
  const resetPresentation = getPopupStatusPresentation({ kind: "reset" });
  setStatus(resetPresentation.message, resetPresentation.tone);
  currentCache = null;
  currentCachedResultFlags = {};
  await queueCacheMutation(async () => {
    if (isCurrentLookupGeneration(generation)) {
      await clearCache(seriesId);
    }
  });
  if (!isCurrentLookupGeneration(generation)) {
    return;
  }

  if (!currentSourceUrl) {
    await renderUnsupportedState();
    return;
  }

  await runLookup(currentSourceUrl, seriesId, createEmptyRejectedProviderUrls(), { ...EMPTY_TITLE_ATTEMPT_INDEXES });
}

async function handleProviderReset(providerKey: ProviderKey, generation?: number): Promise<void> {
  if (generation == null) {
    await queueProviderAction(providerKey, (queuedGeneration) => handleProviderReset(providerKey, queuedGeneration));
    return;
  }

  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  if (!currentCache) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  const currentResult = currentCache.results[providerKey];
  if (!currentResult) {
    return;
  }

  const rejectedUrls = cloneRejectedProviderUrls(currentCache.rejectedUrls);
  if (!rejectedUrls[providerKey].includes(currentResult.url)) {
    rejectedUrls[providerKey].push(currentResult.url);
  }

  const metadata = createMetadataFromCache(currentCache);

  setStatus(`Searching for another ${providerLabel} result...`, "loading");
  try {
    const cacheBeforeAttempt = currentCache;
    const titleAttemptIndexes = { ...currentCache.titleAttemptIndexes };
    const attemptedTitleCursor = titleAttemptIndexes[providerKey] ?? 0;
    const outcome = await searchProviderOutcome(providerKey, metadata, rejectedUrls, titleAttemptIndexes);
    if (!isCurrentLookupGeneration(generation) || !currentCache) {
      return;
    }
    currentProviderSearchOutcomes[providerKey] = outcome;
    const transition = transitionProviderSearch(
      {
        result: currentResult,
        searched: currentCache.searchedProviders[providerKey],
        titleCursor: currentCache.titleAttemptIndexes[providerKey] ?? 0,
      },
      attemptedTitleCursor,
      outcome,
    );
    if (!transition.commit) {
      renderLookup(cacheBeforeAttempt, true);
      showProviderSearchOutcome(providerLabel, outcome);
      return;
    }
    const updatedCache: CachedLookup = {
      ...currentCache,
      rejectedUrls,
      titleAttemptIndexes: {
        ...currentCache.titleAttemptIndexes,
        [providerKey]: transition.titleCursor,
      },
      searchedProviders: {
        ...currentCache.searchedProviders,
        [providerKey]: transition.searched,
      },
      results: {
        ...currentCache.results,
        [providerKey]: transition.result,
      },
      searchedAt: new Date().toISOString(),
    };

    await saveCache(updatedCache);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    currentCachedResultFlags[providerKey] = false;
    currentCache = updatedCache;
    renderLookup(updatedCache, false);
    showProviderSearchOutcome(providerLabel, outcome);
  } catch (error) {
    if (!isCurrentLookupGeneration(generation) || !currentCache) {
      return;
    }
    currentCache = {
      ...currentCache,
      searchedAt: new Date().toISOString(),
    };
    renderLookup(currentCache, true);
    setStatus(error instanceof Error ? error.message : `Unable to refresh ${providerLabel}`, "error");
  }
}

async function handleProviderRetry(providerKey: ProviderKey, generation?: number): Promise<void> {
  if (generation == null) {
    await queueProviderAction(providerKey, (queuedGeneration) => handleProviderRetry(providerKey, queuedGeneration));
    return;
  }

  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  if (!currentCache) {
    return;
  }

  if (retryInProgress[providerKey]) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  const metadata = createMetadataFromCache(currentCache);
  const titleCount = currentCache.series.rankedSearchTitles.length;
  let nextTitleIndex = (currentCache.titleAttemptIndexes[providerKey] ?? 0) + 1;
  if (nextTitleIndex >= titleCount) {
    renderLookup(currentCache, true);
    return;
  }

  retryInProgress[providerKey] = true;
  rerenderCurrentResultsOnly();

  try {
    while (currentCache && isCurrentLookupGeneration(generation) && nextTitleIndex < titleCount) {
      const cacheBeforeAttempt = currentCache;
      const titleAttemptIndexes = { ...currentCache.titleAttemptIndexes, [providerKey]: nextTitleIndex };
      setStatus(`Trying ${providerLabel} title ${nextTitleIndex + 1} of ${titleCount}...`, "loading");

      const outcome = await searchProviderOutcome(providerKey, metadata, currentCache.rejectedUrls, titleAttemptIndexes);
      if (!isCurrentLookupGeneration(generation) || !currentCache) {
        return;
      }
      currentProviderSearchOutcomes[providerKey] = outcome;
      const transition = transitionProviderSearch(
        {
          result: currentCache.results[providerKey],
          searched: currentCache.searchedProviders[providerKey],
          titleCursor: currentCache.titleAttemptIndexes[providerKey] ?? 0,
        },
        nextTitleIndex,
        outcome,
      );
      if (!transition.commit) {
        renderLookup(cacheBeforeAttempt, true);
        showProviderSearchOutcome(providerLabel, outcome);
        return;
      }
      const updatedCache: CachedLookup = {
        ...currentCache,
        titleAttemptIndexes: {
          ...currentCache.titleAttemptIndexes,
          [providerKey]: transition.titleCursor,
        },
        searchedProviders: {
          ...currentCache.searchedProviders,
          [providerKey]: transition.searched,
        },
        results: {
          ...currentCache.results,
          [providerKey]: transition.result,
        },
        searchedAt: new Date().toISOString(),
      };

      await saveCache(updatedCache);
      if (!isCurrentLookupGeneration(generation)) {
        return;
      }
      currentCachedResultFlags[providerKey] = false;
      currentCache = updatedCache;
      rerenderCurrentResultsOnly();

      if (outcome.kind === "found") {
        showProviderSearchOutcome(providerLabel, outcome);
        return;
      }

      nextTitleIndex = transition.titleCursor + 1;
      if (nextTitleIndex >= titleCount) {
        setStatus(`All ${providerLabel} title attempts exhausted`, "error");
        return;
      }

      for (let countdown = RETRY_COOLDOWN_SECONDS; countdown > 0; countdown -= 1) {
        retryCountdowns[providerKey] = countdown;
        rerenderCurrentResultsOnly();
        setStatus(`Rate limit cooldown: retrying ${providerLabel} in ${countdown}s`, "loading");
        await sleep(1000);
        if (!isCurrentLookupGeneration(generation)) {
          return;
        }
      }

      delete retryCountdowns[providerKey];
      rerenderCurrentResultsOnly();
    }
  } finally {
    delete retryCountdowns[providerKey];
    delete retryInProgress[providerKey];
    rerenderCurrentResultsOnly();
  }
}

async function handleProviderSearchNow(providerKey: ProviderKey, generation?: number): Promise<void> {
  if (generation == null) {
    await queueProviderAction(providerKey, (queuedGeneration) => handleProviderSearchNow(providerKey, queuedGeneration));
    return;
  }

  if (!isCurrentLookupGeneration(generation)) {
    return;
  }
  if (!currentCache) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  const metadata = createMetadataFromCache(currentCache);

  setStatus(`Searching ${providerLabel}...`, "loading");

  try {
    const cacheBeforeAttempt = currentCache;
    const attemptedTitleCursor = currentCache.titleAttemptIndexes[providerKey] ?? 0;
    const outcome = await searchProviderOutcome(
      providerKey,
      metadata,
      currentCache.rejectedUrls,
      currentCache.titleAttemptIndexes,
    );
    if (!isCurrentLookupGeneration(generation) || !currentCache) {
      return;
    }
    currentProviderSearchOutcomes[providerKey] = outcome;
    const transition = transitionProviderSearch(
      {
        result: currentCache.results[providerKey],
        searched: currentCache.searchedProviders[providerKey],
        titleCursor: attemptedTitleCursor,
      },
      attemptedTitleCursor,
      outcome,
    );
    if (!transition.commit) {
      renderLookup(cacheBeforeAttempt, true);
      showProviderSearchOutcome(providerLabel, outcome);
      return;
    }
    const updatedCache: CachedLookup = {
      ...currentCache,
      titleAttemptIndexes: {
        ...currentCache.titleAttemptIndexes,
        [providerKey]: transition.titleCursor,
      },
      searchedProviders: {
        ...currentCache.searchedProviders,
        [providerKey]: transition.searched,
      },
      results: {
        ...currentCache.results,
        [providerKey]: transition.result,
      },
      searchedAt: new Date().toISOString(),
    };

    await saveCache(updatedCache);
    if (!isCurrentLookupGeneration(generation)) {
      return;
    }
    currentCachedResultFlags[providerKey] = false;
    currentCache = updatedCache;
    renderLookup(updatedCache, false);
    showProviderSearchOutcome(providerLabel, outcome);
  } catch (error) {
    if (!isCurrentLookupGeneration(generation) || !currentCache) {
      return;
    }
    renderLookup(currentCache, true);
    setStatus(error instanceof Error ? error.message : `Unable to search ${providerLabel}`, "error");
  }
}

function requestInlineConfirmation(
  button: HTMLButtonElement,
  message: string,
  action: () => Promise<void> | void,
): void {
  requestMultiClickConfirmation(button, [message], action);
}

function requestMultiClickConfirmation(
  button: HTMLButtonElement,
  messages: string[],
  action: () => Promise<void> | void,
  activeClassName = "icon-button--confirm",
): void {
  if (pendingConfirmation?.button === button && document.activeElement === button) {
    if (pendingConfirmation.messageIndex >= pendingConfirmation.messages.length - 1) {
      const confirmedAction = pendingConfirmation.action;
      clearPendingConfirmation();
      runPopupTask(confirmedAction, "Unable to complete the confirmed action.");
      return;
    }

    pendingConfirmation.messageIndex += 1;
    resetPendingConfirmationTimeout();
    showConfirmPanel(pendingConfirmation.messages[pendingConfirmation.messageIndex]);
    return;
  }

  clearPendingConfirmation();
  button.classList.add(activeClassName);
  button.focus();

  pendingConfirmation = {
    button,
    messages,
    messageIndex: 0,
    action,
    activeClassName,
    timeoutId: 0,
  };
  resetPendingConfirmationTimeout();

  button.addEventListener(
    "blur",
    () => {
      window.setTimeout(() => {
        if (pendingConfirmation?.button === button && document.activeElement !== button) {
          clearPendingConfirmation();
        }
      }, 0);
    },
    { once: true },
  );

  showConfirmPanel(messages[0]);
}

function resetPendingConfirmationTimeout(): void {
  if (!pendingConfirmation) {
    return;
  }

  window.clearTimeout(pendingConfirmation.timeoutId);
  pendingConfirmation.timeoutId = window.setTimeout(() => {
    clearPendingConfirmation();
  }, 6000);
}

function showConfirmPanel(message: string): void {
  const panel = getConfirmPanel();
  getConfirmMessageNode().textContent = message;
  panel.hidden = false;
}

function clearPendingConfirmation(): void {
  if (!pendingConfirmation) {
    getConfirmPanel().hidden = true;
    return;
  }

  window.clearTimeout(pendingConfirmation.timeoutId);
  pendingConfirmation.button.classList.remove(pendingConfirmation.activeClassName);
  pendingConfirmation = null;
  getConfirmPanel().hidden = true;
}

function setStatus(message: string, tone: StatusTone): void {
  const statusNode = getStatusNode();
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
}

function setResetEnabled(enabled: boolean): void {
  getResetButton().disabled = !enabled;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTitleNode(): HTMLElement {
  return document.getElementById("series-title") as HTMLElement;
}

function getSubtitleNode(): HTMLElement {
  return document.getElementById("series-subtitle") as HTMLElement;
}

function getResultsNode(): HTMLElement {
  return document.getElementById("results") as HTMLElement;
}

function getStatusNode(): HTMLElement {
  return document.getElementById("status") as HTMLElement;
}

function getOptionsButton(): HTMLButtonElement {
  return document.getElementById("options-button") as HTMLButtonElement;
}

function getProvidersTabButton(): HTMLButtonElement {
  return document.getElementById("options-tab-providers") as HTMLButtonElement;
}

function getExtensionTabButton(): HTMLButtonElement {
  return document.getElementById("options-tab-extension") as HTMLButtonElement;
}

function getInfoTabButton(): HTMLButtonElement {
  return document.getElementById("options-tab-info") as HTMLButtonElement;
}

function getProvidersTabPanel(): HTMLElement {
  return document.getElementById("options-panel-providers") as HTMLElement;
}

function getExtensionTabPanel(): HTMLElement {
  return document.getElementById("options-panel-extension") as HTMLElement;
}

function getInfoTabPanel(): HTMLElement {
  return document.getElementById("options-panel-info") as HTMLElement;
}

function getInfoVersionLabelNode(): HTMLElement {
  return document.getElementById("info-version-label") as HTMLElement;
}

function getInfoVersionNode(): HTMLButtonElement {
  return document.getElementById("info-version") as HTMLButtonElement;
}

function getInfoInstallSourceNode(): HTMLAnchorElement {
  return document.getElementById("info-install-source") as HTMLAnchorElement;
}

function getInfoInstallUpdateNode(): HTMLAnchorElement {
  return document.getElementById("info-install-update") as HTMLAnchorElement;
}

function getInfoMangaDexPurgeRow(): HTMLElement {
  return document.getElementById("info-mangadex-purge-row") as HTMLElement;
}

function getInfoCachedSeriesStatButton(): HTMLButtonElement {
  return document.getElementById("info-cached-series-stat") as HTMLButtonElement;
}

function getInfoMangaDexPurgeStatButton(): HTMLButtonElement {
  return document.getElementById("info-mangadex-purge-stat") as HTMLButtonElement;
}

function getInfoResetExtensionButton(): HTMLButtonElement {
  return document.getElementById("info-reset-extension-button") as HTMLButtonElement;
}

function getMangaBakaButton(): HTMLButtonElement {
  return document.getElementById("mangabaka-button") as HTMLButtonElement;
}

function getOptionsPanel(): HTMLElement {
  return document.getElementById("options-panel") as HTMLElement;
}

function getAtsuOptionInput(): HTMLInputElement {
  return document.getElementById("option-atsu") as HTMLInputElement;
}

function getMangaDexOptionInput(): HTMLInputElement {
  return document.getElementById("option-mangadex") as HTMLInputElement;
}

function getComixToOptionInput(): HTMLInputElement {
  return document.getElementById("option-comixto") as HTMLInputElement;
}

function getMangaFireOptionInput(): HTMLInputElement {
  return document.getElementById("option-mangafire") as HTMLInputElement;
}

function getWeebCentralOptionInput(): HTMLInputElement {
  return document.getElementById("option-weebcentral") as HTMLInputElement;
}

function getEHentaiOptionInput(): HTMLInputElement {
  return document.getElementById("option-ehentai") as HTMLInputElement;
}

function getExHentaiOptionInput(): HTMLInputElement {
  return document.getElementById("option-exhentai") as HTMLInputElement;
}

function getProviderLabelModeSelect(): HTMLSelectElement {
  return document.getElementById("option-provider-label-mode") as HTMLSelectElement;
}

function getMangaBakaLinkTypeSelect(): HTMLSelectElement {
  return document.getElementById("option-mangabaka-link-type") as HTMLSelectElement;
}

function getSearchLinkTypeSelect(): HTMLSelectElement {
  return document.getElementById("option-search-link-type") as HTMLSelectElement;
}

function getProviderLinkTypeSelect(): HTMLSelectElement {
  return document.getElementById("option-provider-link-type") as HTMLSelectElement;
}

function getContextMenuModeSelect(): HTMLSelectElement {
  return document.getElementById("option-context-menu-mode") as HTMLSelectElement;
}

function getContextMenuLinkTypeSelect(): HTMLSelectElement {
  return document.getElementById("option-context-menu-link-type") as HTMLSelectElement;
}

function getContextMenuLinkTypeRow(): HTMLLabelElement {
  return document.getElementById("option-context-menu-link-type-row") as HTMLLabelElement;
}

function getMangaBakaButtonTargetSelect(): HTMLSelectElement {
  return document.getElementById("option-mangabaka-button-target") as HTMLSelectElement;
}

function getMangaBakaProfileRow(): HTMLElement {
  return document.getElementById("option-mangabaka-profile-row") as HTMLElement;
}

function getMangaBakaProfileNameInput(): HTMLInputElement {
  return document.getElementById("option-mangabaka-profile-name") as HTMLInputElement;
}

function getConfirmPanel(): HTMLElement {
  return document.getElementById("confirm-panel") as HTMLElement;
}

function getConfirmMessageNode(): HTMLElement {
  return document.getElementById("confirm-message") as HTMLElement;
}

function getResetButton(): HTMLButtonElement {
  return document.getElementById("reset-button") as HTMLButtonElement;
}

