// noinspection JSUnusedGlobalSymbols
interface MangaBakaMetadata {
  seriesId: string;
  sourceUrl: string;
  primaryTitle: string;
  titles: string[];
  authors: string[];
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
  version: 11;
  seriesId: string;
  sourceUrl: string;
  primaryTitle: string;
  titles: string[];
  authors: string[];
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

interface ExtensionSettings {
  enabledProviders: Record<ProviderKey, boolean>;
  providerLabelMode: "titles" | "icons" | "stacked";
  mangaBakaLinkType: LinkTargetType;
  providerLinkType: LinkTargetType;
  optionsPanelTab: OptionsPanelTab;
  mangaBakaButtonTarget: MangaBakaButtonTarget;
  mangaBakaProfileName: string;
}

type ProviderKey = keyof LookupResults;
type ProviderLabelMode = ExtensionSettings["providerLabelMode"];
type LinkTargetType = "current" | "new";
type OptionsPanelTab = "providers" | "extension" | "info";
type MangaBakaButtonTarget = "root" | "library" | "profile";
type MangaDexChapterState = "available" | "purged" | "no_chapters_tld";
type StoredMangaDexChapterState = Exclude<MangaDexChapterState, "available">;
type MangaDexStatusIconKey = "slight-smile" | "melting-face" | "clown-face" | "pensive";
type StatusTone = "idle" | "loading" | "success" | "error";
type PopupViewState = "unsupported" | "invalid" | "loading" | "lookup" | "provider" | "error";

interface ProviderPageContext {
  providerKey: ProviderKey;
  providerLabel: ProviderMatch["provider"];
  pageType: "series" | "chapter" | null;
  primaryTitle: string;
  titles: string[];
  sourceUrl: string;
  isSearchable: boolean;
}

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

const CACHE_VERSION = 11;
const SETTINGS_KEY = "extension:settings";
const POPUP_RELEASE_UPDATE_STORAGE_KEY = "extension:release-update";
const LOCAL_INSTALL_SOURCE_URL = "https://github.com/Moriko1/MangaBakaURL-Finder/releases/latest";
const GOOGLE_INSTALL_SOURCE_URL = "https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb";
const PROVIDER_KEYS: ProviderKey[] = ["atsu", "mangadex", "ehentai", "exhentai", "comixto", "mangafire", "weebcentral"];
const PROVIDERS: Array<{ key: ProviderKey; label: ProviderMatch["provider"] }> = [
  { key: "atsu", label: "Atsumaru" },
  { key: "mangadex", label: "MangaDex" },
  { key: "ehentai", label: "E-Hentai" },
  { key: "exhentai", label: "ExHentai" },
  { key: "comixto", label: "Comix" },
  { key: "mangafire", label: "MangaFire" },
  { key: "weebcentral", label: "WeebCentral" },
];
const PROVIDER_LABELS: Record<ProviderKey, ProviderMatch["provider"]> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.key, provider.label]),
) as Record<ProviderKey, ProviderMatch["provider"]>;
const VISIBLE_PROVIDER_KEYS: ProviderKey[] = ["atsu", "mangadex", "mangafire", "weebcentral", "ehentai", "exhentai"];
const PROVIDER_ICON_EXTENSIONS: Record<ProviderKey, string> = {
  atsu: "ico",
  mangadex: "ico",
  ehentai: "ico",
  exhentai: "ico",
  comixto: "ico",
  mangafire: "png",
  weebcentral: "ico",
};
const DEFAULT_ENABLED_PROVIDERS: Record<ProviderKey, boolean> = {
  atsu: true,
  mangadex: true,
  ehentai: false,
  exhentai: false,
  comixto: false,
  mangafire: false,
  weebcentral: false,
};
const DEFAULT_PROVIDER_LABEL_MODE: ProviderLabelMode = "titles";
const DEFAULT_MANGABAKA_LINK_TARGET_TYPE: LinkTargetType = "current";
const DEFAULT_PROVIDER_LINK_TARGET_TYPE: LinkTargetType = "new";
const DEFAULT_OPTIONS_PANEL_TAB: OptionsPanelTab = "providers";
const DEFAULT_MANGABAKA_BUTTON_TARGET: MangaBakaButtonTarget = "root";
const EMPTY_LOOKUP_RESULTS: LookupResults = {
  atsu: null,
  mangadex: null,
  ehentai: null,
  exhentai: null,
  comixto: null,
  mangafire: null,
  weebcentral: null,
};
const EMPTY_REJECTED_PROVIDER_URLS: RejectedProviderUrls = {
  atsu: [],
  mangadex: [],
  ehentai: [],
  exhentai: [],
  comixto: [],
  mangafire: [],
  weebcentral: [],
};
const EMPTY_TITLE_ATTEMPT_INDEXES: Record<ProviderKey, number> = {
  atsu: 0,
  mangadex: 0,
  ehentai: 0,
  exhentai: 0,
  comixto: 0,
  mangafire: 0,
  weebcentral: 0,
};
const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledProviders: { ...DEFAULT_ENABLED_PROVIDERS },
  providerLabelMode: DEFAULT_PROVIDER_LABEL_MODE,
  mangaBakaLinkType: DEFAULT_MANGABAKA_LINK_TARGET_TYPE,
  providerLinkType: DEFAULT_PROVIDER_LINK_TARGET_TYPE,
  optionsPanelTab: DEFAULT_OPTIONS_PANEL_TAB,
  mangaBakaButtonTarget: DEFAULT_MANGABAKA_BUTTON_TARGET,
  mangaBakaProfileName: "",
};
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
let currentCachedResultFlags: Partial<Record<ProviderKey, boolean>> = {};
let pendingConfirmation: PendingConfirmation | null = null;
let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
let retryCountdowns: Partial<Record<ProviderKey, number>> = {};
let retryInProgress: Partial<Record<ProviderKey, boolean>> = {};
let armedReadLinkSaves: Partial<Record<ProviderKey, string>> = {};
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
const RETRY_COOLDOWN_SECONDS = 2;

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup();
});

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
  const [inactiveTitleMarkup, settings, activeTab] = await Promise.all([
    getAlternatingInactiveTitleMarkup(),
    loadSettings(),
    getActiveTab(),
  ]);
  currentInactiveTitleMarkup = inactiveTitleMarkup;
  currentSettings = settings;
  wireOptionsControls();
  renderOptionsPanel();

  currentTabId = typeof activeTab?.id === "number" ? activeTab.id : null;
  currentSourceUrl = activeTab?.url ?? "";
  void syncActionIcon();

  const providerPageContext = await getProviderPageContext(currentSourceUrl);
  if (providerPageContext) {
    currentCache = null;
    currentCachedResultFlags = {};
    currentProviderPage = providerPageContext;
    renderProviderPageState(providerPageContext);
    return;
  }

  currentProviderPage = null;
  if (!isMangabakaSeriesUrl(currentSourceUrl)) {
    currentCache = null;
    currentCachedResultFlags = {};
    await renderUnsupportedState();
    return;
  }

  const seriesId = getSeriesIdFromUrl(currentSourceUrl);
  if (!seriesId) {
    currentCache = null;
    currentCachedResultFlags = {};
    await renderUnsupportedState();
    return;
  }

  setResetEnabled(true);
  wireTopResetButton(seriesId);

  const previewTitle = extractMangaBakaPreviewTitle(activeTab?.title);
  if (previewTitle) {
    renderMangaBakaHeader(previewTitle, []);
  }

  const sourceUrlSnapshot = currentSourceUrl;
  const liveMangaBakaMetadataPromise = extractMetadataFromActiveTab()
    .then((payload) => payload ? createMangaBakaMetadata(seriesId, sourceUrlSnapshot, payload) : null)
    .catch(() => null);
  void liveMangaBakaMetadataPromise.then((metadata) => {
    if (!metadata || currentCache || currentSourceUrl !== sourceUrlSnapshot || currentProviderPage) {
      return;
    }

    renderMangaBakaHeader(metadata.primaryTitle, metadata.authors);
  });

  const cachedLookup = await loadCache(seriesId);
  if (cachedLookup) {
    currentCache = cachedLookup;
    currentCachedResultFlags = buildCachedResultFlags(cachedLookup.results, true);
    renderLookup(cachedLookup, true);
    return;
  }

  const liveMangaBakaMetadata = await liveMangaBakaMetadataPromise;
  await runLookup(
    currentSourceUrl,
    seriesId,
    createEmptyRejectedProviderUrls(),
    { ...EMPTY_TITLE_ATTEMPT_INDEXES },
    liveMangaBakaMetadata ?? undefined,
  );
}

async function getActiveTab(): Promise<{ id?: number; url?: string; title?: string } | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function isPopupMissingTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id|Tabs cannot be edited right now|tab was closed/i.test(error.message);
}

async function resolveUsableTabId(): Promise<number | null> {
  if (currentTabId != null) {
    try {
      await chrome.tabs.get(currentTabId);
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
      type: "sync-action-icon",
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
        type: "ensure-release-update-status",
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

function createMangaBakaMetadata(
  seriesId: string,
  sourceUrl: string,
  extractedMetadata: ExtractedMetadataPayload,
): MangaBakaMetadata {
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

  infoPanelStatsRefreshPromise ??= refreshInfoPanelStats().finally(() => {
    infoPanelStatsRefreshPromise = null;
  });
  return infoPanelStatsRefreshPromise;
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
  return `lookup:${seriesId}`;
}

async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as ExtensionSettings | undefined;
  const storedEnabledProviders = settings?.enabledProviders;
  const providerLabelMode = settings?.providerLabelMode;
  const mangaBakaLinkType = normalizeLinkTargetType(settings?.mangaBakaLinkType, DEFAULT_MANGABAKA_LINK_TARGET_TYPE);
  const providerLinkType = normalizeLinkTargetType(settings?.providerLinkType, DEFAULT_PROVIDER_LINK_TARGET_TYPE);
  const optionsPanelTab = normalizeOptionsPanelTab(settings?.optionsPanelTab);
  const mangaBakaButtonTarget = normalizeMangaBakaButtonTarget(settings?.mangaBakaButtonTarget);

  return {
    enabledProviders: {
      ...DEFAULT_ENABLED_PROVIDERS,
      ...storedEnabledProviders,
      comixto: false,
    },
    providerLabelMode: providerLabelMode === "icons" || providerLabelMode === "stacked"
      ? providerLabelMode
      : DEFAULT_PROVIDER_LABEL_MODE,
    mangaBakaLinkType,
    providerLinkType,
    optionsPanelTab,
    mangaBakaButtonTarget,
    mangaBakaProfileName: typeof settings?.mangaBakaProfileName === "string" ? settings.mangaBakaProfileName : "",
  };
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function wireOptionsControls(): void {
  getMangaBakaButton().onclick = () => {
    void navigateToConfiguredMangaBakaPage();
  };

  getOptionsButton().onclick = () => {
    setOptionsPanelOpen(!isOptionsPanelOpen());
  };

  getProvidersTabButton().onclick = () => {
    void updateOptionsPanelTab("providers");
  };
  getExtensionTabButton().onclick = () => {
    void updateOptionsPanelTab("extension");
  };
  getInfoTabButton().onclick = () => {
    void updateOptionsPanelTab("info");
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
      void updateSettings({
        ...currentSettings,
        enabledProviders: {
          ...currentSettings.enabledProviders,
          [providerKey]: input.checked,
        },
      });
    };
  };

  wireProviderOption("atsu", getAtsuOptionInput());
  wireProviderOption("mangadex", getMangaDexOptionInput());
  wireProviderOption("mangafire", getMangaFireOptionInput());
  wireProviderOption("weebcentral", getWeebCentralOptionInput());
  wireProviderOption("ehentai", getEHentaiOptionInput());
  wireProviderOption("exhentai", getExHentaiOptionInput());

  getProviderLabelModeSelect().onchange = () => {
    const value = getProviderLabelModeSelect().value;
    void updateSettings({
      ...currentSettings,
      providerLabelMode: value === "icons" || value === "stacked" ? value : DEFAULT_PROVIDER_LABEL_MODE,
    });
  };

  getMangaBakaLinkTypeSelect().onchange = () => {
    void updateSettings({
      ...currentSettings,
      mangaBakaLinkType: normalizeLinkTargetType(getMangaBakaLinkTypeSelect().value),
    });
  };

  getProviderLinkTypeSelect().onchange = () => {
    void updateSettings({
      ...currentSettings,
      providerLinkType: normalizeLinkTargetType(getProviderLinkTypeSelect().value),
    });
  };

  getMangaBakaButtonTargetSelect().onchange = () => {
    void updateSettings({
      ...currentSettings,
      mangaBakaButtonTarget: normalizeMangaBakaButtonTarget(getMangaBakaButtonTargetSelect().value),
    });
  };

  getMangaBakaProfileNameInput().oninput = () => {
    currentSettings = {
      ...currentSettings,
      mangaBakaProfileName: getMangaBakaProfileNameInput().value,
    };
    renderMangaBakaNavigationControls();
    void saveSettings(currentSettings);
  };
}

function renderOptionsPanel(): void {
  getAtsuOptionInput().checked = currentSettings.enabledProviders.atsu;
  getMangaDexOptionInput().checked = currentSettings.enabledProviders.mangadex;
  getComixToOptionInput().checked = false;
  getMangaFireOptionInput().checked = currentSettings.enabledProviders.mangafire;
  getWeebCentralOptionInput().checked = currentSettings.enabledProviders.weebcentral;
  getEHentaiOptionInput().checked = currentSettings.enabledProviders.ehentai;
  getExHentaiOptionInput().checked = currentSettings.enabledProviders.exhentai;
  getProviderLabelModeSelect().value = currentSettings.providerLabelMode;
  getMangaBakaLinkTypeSelect().value = currentSettings.mangaBakaLinkType;
  getProviderLinkTypeSelect().value = currentSettings.providerLinkType;
  getMangaBakaButtonTargetSelect().value = currentSettings.mangaBakaButtonTarget;
  getMangaBakaProfileNameInput().value = currentSettings.mangaBakaProfileName;
  renderInfoPanel();
  renderOptionsPanelTabs();
  renderMangaBakaNavigationControls();
}

async function updateSettings(settings: ExtensionSettings): Promise<void> {
  const previousSettings = currentSettings;
  currentSettings = settings;
  renderOptionsPanel();
  await saveSettings(currentSettings);
  void syncActionIcon();

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

    currentCache = {
      ...currentCache,
      searchedProviders,
    };
    await saveCache(currentCache);
  }

  await rerenderCurrentView();
}

async function updateOptionsPanelTab(optionsPanelTab: OptionsPanelTab): Promise<void> {
  if (currentSettings.optionsPanelTab === optionsPanelTab) {
    renderOptionsPanelTabs();
    if (optionsPanelTab === "info" && isOptionsPanelOpen()) {
      void refreshInfoPanelStatsIfNeeded();
    }
    return;
  }

  currentSettings = {
    ...currentSettings,
    optionsPanelTab,
  };
  renderOptionsPanelTabs();
  if (optionsPanelTab === "info" && isOptionsPanelOpen()) {
    void refreshInfoPanelStatsIfNeeded();
  }
  await saveSettings(currentSettings);
}

function normalizeLinkTargetType(value: string | undefined, fallback: LinkTargetType = DEFAULT_MANGABAKA_LINK_TARGET_TYPE): LinkTargetType {
  return value === "new" || value === "current" ? value : fallback;
}

function normalizeOptionsPanelTab(value: string | undefined): OptionsPanelTab {
  switch (value) {
    case "providers":
    case "extension":
    case "info":
      return value;
    default:
      return DEFAULT_OPTIONS_PANEL_TAB;
  }
}

function normalizeMangaBakaButtonTarget(value: string | undefined): MangaBakaButtonTarget {
  switch (value) {
    case "root":
    case "library":
    case "profile":
      return value;
    default:
      return DEFAULT_MANGABAKA_BUTTON_TARGET;
  }
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

function isCachedLookup(value: unknown): value is CachedLookup {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cache = value as Partial<CachedLookup>;
  return cache.version === CACHE_VERSION && typeof cache.seriesId === "string" && typeof cache.results === "object";
}

function getMangaDexChapterState(result: ProviderMatch | null): MangaDexChapterState | null {
  if (result?.provider !== "MangaDex") {
    return null;
  }

  if (result.manualMangaDexChapterState === "purged" || result.manualMangaDexChapterState === "no_chapters_tld") {
    return result.manualMangaDexChapterState;
  }

  if (typeof result.latestChapterNumber === "string" && result.latestChapterNumber.length > 0) {
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
    if (!key.startsWith("lookup:") || !isCachedLookup(value)) {
      continue;
    }

    seriesCount += 1;
    totalBytes += estimateStorageEntryBytes(key, value);

    const mangaDexResult = value.results.mangadex;
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
  hasLoadedInfoPanelStats = true;
  renderInfoPanel();
}

async function handleExtensionReset(): Promise<void> {
  setStatus("Resetting extension...", "loading");
  await chrome.storage.local.clear();
  currentCache = null;
  currentCachedResultFlags = {};
  currentSettings = {
    ...DEFAULT_SETTINGS,
    enabledProviders: { ...DEFAULT_ENABLED_PROVIDERS },
  };
  retryCountdowns = {};
  retryInProgress = {};
  armedReadLinkSaves = {};
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
      void refreshInfoPanelStatsIfNeeded();
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
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.replace(/\/+$/, "");

    if (parsedUrl.hostname === "mangadex.org") {
      if (/^\/title\/[^/]+(?:\/[^/]+)?$/i.test(path)) {
        return { providerKey: "mangadex", pageType: "series" };
      }

      if (/^\/chapter\/[^/]+$/i.test(path)) {
        return { providerKey: "mangadex", pageType: "chapter" };
      }

       return { providerKey: "mangadex", pageType: null };
    }

    if (parsedUrl.hostname === "atsu.moe") {
      if (/^\/manga\/[^/]+$/i.test(path)) {
        return { providerKey: "atsu", pageType: "series" };
      }

      if (/^\/read\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "atsu", pageType: "chapter" };
      }

      return { providerKey: "atsu", pageType: null };
    }

    if (parsedUrl.hostname === "mangafire.to") {
      if (/^\/manga\/[^/]+$/i.test(path)) {
        return { providerKey: "mangafire", pageType: "series" };
      }

      if (/^\/read\/[^/]+(?:\/[^/]+){2,}$/i.test(path)) {
        return { providerKey: "mangafire", pageType: "chapter" };
      }

      return { providerKey: "mangafire", pageType: null };
    }

    if (parsedUrl.hostname === "weebcentral.com") {
      if (/^\/series\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "weebcentral", pageType: "series" };
      }

      if (/^\/chapters\/[^/]+$/i.test(path)) {
        return { providerKey: "weebcentral", pageType: "chapter" };
      }

      return { providerKey: "weebcentral", pageType: null };
    }

    if (parsedUrl.hostname === "e-hentai.org") {
      if (/^\/g\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "ehentai", pageType: "series" };
      }

      if (/^\/s\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "ehentai", pageType: "chapter" };
      }

      return { providerKey: "ehentai", pageType: null };
    }

    if (parsedUrl.hostname === "exhentai.org") {
      if (/^\/g\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "exhentai", pageType: "series" };
      }

      if (/^\/s\/[^/]+\/[^/]+$/i.test(path)) {
        return { providerKey: "exhentai", pageType: "chapter" };
      }

      return { providerKey: "exhentai", pageType: null };
    }
  } catch {
    return null;
  }

  return null;
}

async function getProviderPageContext(url: string): Promise<ProviderPageContext | null> {
  const match = matchProviderPage(url);
  if (!match || !currentSettings.enabledProviders[match.providerKey]) {
    return null;
  }

  if (match.pageType == null) {
    return {
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
    providerKey: match.providerKey,
    providerLabel: PROVIDER_LABELS[match.providerKey],
    pageType: match.pageType,
    primaryTitle: titles.length > 0 ? pickPreferredTitle(titles) : PROVIDER_LABELS[match.providerKey],
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
  switch (providerKey) {
    case "atsu":
      return fetchAtsumaruProviderPageMetadata(sourceUrl, pageType);
    case "mangadex":
      return fetchMangaDexProviderPageMetadata(sourceUrl, pageType);
    case "mangafire":
      return fetchMangaFireProviderPageMetadata(sourceUrl);
    case "weebcentral":
      return fetchWeebCentralProviderPageMetadata(sourceUrl, pageType);
    case "ehentai":
    case "exhentai":
    case "comixto":
    default:
      return null;
  }
}

async function fetchProviderDocumentWithStatus(
  sourceUrl: string,
): Promise<{ status: number | null; document: Document | null }> {
  try {
    const response = await fetch(sourceUrl, { credentials: "include" });
    if (!response.ok) {
      return { status: response.status, document: null };
    }

    return {
      status: response.status,
      document: new DOMParser().parseFromString(await response.text(), "text/html"),
    };
  } catch {
    return { status: null, document: null };
  }
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

  switch (providerKey) {
    case "atsu":
    case "mangadex":
    case "mangafire":
    case "weebcentral":
      return stripTrailingChapterInfoFromTitle(trimmed);
    case "ehentai":
    case "exhentai":
      return extractEHentaiBaseTitle(trimmed);
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
      const response = await fetch(`https://api.mangadex.org/manga/${encodeURIComponent(segments[1])}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        data?: {
          id: string;
          attributes?: {
            title?: Record<string, string>;
            altTitles?: Array<Record<string, string>>;
          };
        };
      };
      const titles = cleanProviderPageTitles("mangadex", getMangaDexTitles(payload.data ?? {}));
      return titles.length > 0 ? { titles, authors: [] } : null;
    }

    if (pageType === "chapter" && segments[0] === "chapter" && segments[1]) {
      const response = await fetch(`https://api.mangadex.org/chapter/${encodeURIComponent(segments[1])}?includes[]=manga`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        data?: {
          relationships?: Array<{
            type?: string;
            attributes?: {
              title?: Record<string, string>;
              altTitles?: Array<Record<string, string>>;
            };
          }>;
        };
      };
      const mangaRelationship = payload.data?.relationships?.find((relationship) => relationship.type === "manga");
      const titles = cleanProviderPageTitles("mangadex", getMangaDexTitles(mangaRelationship ?? {}));
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
        ...getSeriesTitlesFromAnchors(documentNode, /^\/series\/[^/]+\/[^/]+$/i),
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

          switch (activeProviderKey) {
            case "atsu":
              return stripTrailingChapterInfo(trimmed);
            case "mangadex":
            case "mangafire":
            case "weebcentral":
              return stripTrailingChapterInfo(trimmed);
            case "ehentai":
            case "exhentai":
              return extractEHentaiBaseTitle(trimmed);
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

        switch (activeProviderKey) {
          case "mangadex": {
            if (sourceSegments[0] === "title" && sourceSegments[2]) {
              prioritizedCandidates.push(hyphenatedTitleToText(sourceSegments[2]));
            }
            addAnchorMatches(/^\/title\/[^/]+(?:\/[^/]+)?$/i, prioritizedCandidates);
            addSelectorText(["main h1", "main h2", "main [role='heading']", "header h1", "header h2"], prioritizedCandidates);
            break;
          }
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
            addAnchorMatches(/^\/series\/[^/]+\/[^/]+$/i, prioritizedCandidates);
            addSelectorText(["main h1", "main h2", "header h1", "header h2", "[class*='title']", "[class*='series']"], prioritizedCandidates);
            break;
          }
          case "ehentai":
          case "exhentai": {
            addSelectorText(["#gn", "#gj", "h1"], prioritizedCandidates);
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

function buildMangaBakaSearchUrl(title: string): string {
  return `https://mangabaka.org/search?q=${encodeURIComponent(title)}`;
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

function createInitialSearchedProviders(enabledProviders: Record<ProviderKey, boolean>): Record<ProviderKey, boolean> {
  return PROVIDER_KEYS.reduce(
    (result, providerKey) => {
      result[providerKey] = enabledProviders[providerKey];
      return result;
    },
    {} as Record<ProviderKey, boolean>,
  );
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

async function loadCache(seriesId: string): Promise<CachedLookup | null> {
  const cacheKey = getCacheKey(seriesId);
  const stored = await chrome.storage.local.get(cacheKey);
  const cache = stored[cacheKey] as CachedLookup | undefined;

  if (!cache || cache.version !== CACHE_VERSION) {
    return null;
  }

  return {
    ...cache,
    rejectedUrls: {
      ...createEmptyRejectedProviderUrls(),
      ...cache.rejectedUrls,
    },
    titleAttemptIndexes: {
      ...EMPTY_TITLE_ATTEMPT_INDEXES,
      ...cache.titleAttemptIndexes,
    },
    searchedProviders: {
      ...DEFAULT_ENABLED_PROVIDERS,
      ...cache.searchedProviders,
    },
  };
}

async function saveCache(cache: CachedLookup): Promise<void> {
  await chrome.storage.local.set({
    [getCacheKey(cache.seriesId)]: cache,
  });
  await refreshInfoPanelStats();
}

async function clearCache(seriesId: string): Promise<void> {
  await chrome.storage.local.remove(getCacheKey(seriesId));
  await refreshInfoPanelStats();
}

async function runLookup(
  sourceUrl: string,
  seriesId: string,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
  metadataOverride?: MangaBakaMetadata,
): Promise<void> {
  currentCache = null;
  setStatus("Reading MangaBaka metadata...", "loading");
  renderLoadingState();

  try {
    const metadata = metadataOverride ?? (await fetchMangaBakaMetadata(sourceUrl, seriesId));
    setStatus("Searching enabled providers...", "loading");
    const results = await searchProviders(metadata, rejectedUrls, titleAttemptIndexes);

    const cache: CachedLookup = {
      version: CACHE_VERSION,
      seriesId: metadata.seriesId,
      sourceUrl: metadata.sourceUrl,
      primaryTitle: metadata.primaryTitle,
      titles: metadata.titles,
      authors: metadata.authors,
      results,
      rejectedUrls: cloneRejectedProviderUrls(rejectedUrls),
      titleAttemptIndexes: { ...titleAttemptIndexes },
      searchedProviders: createInitialSearchedProviders(currentSettings.enabledProviders),
      searchedAt: new Date().toISOString(),
    };

    await saveCache(cache);
    currentCache = cache;
    currentCachedResultFlags = buildCachedResultFlags(results, false);
    renderLookup(cache, false);
  } catch (error) {
    currentCache = null;
    if (error instanceof InvalidMangaBakaPageError) {
      await renderInvalidPageState();
      return;
    }

    const message = error instanceof Error ? error.message : "Search failed.";
    renderErrorState(message);
  }
}

async function fetchMangaBakaMetadata(sourceUrl: string, seriesId: string): Promise<MangaBakaMetadata> {
  const livePageMetadata = await extractMetadataFromActiveTab();
  if (livePageMetadata) {
    return {
      seriesId,
      sourceUrl,
      primaryTitle: pickPreferredTitle(livePageMetadata.titles),
      titles: livePageMetadata.titles,
      authors: livePageMetadata.authors,
    };
  }

  const response = await fetch(sourceUrl);
  if (response.status === 404) {
    throw new InvalidMangaBakaPageError();
  }

  if (!response.ok) {
    throw new Error(`MangaBaka request failed (${response.status}).`);
  }

  const html = await response.text();
  const extractedMetadata = extractMetadataFromHtml(html);
  if (extractedMetadata) {
    return {
      seriesId,
      sourceUrl,
      primaryTitle: pickPreferredTitle(extractedMetadata.titles),
      titles: extractedMetadata.titles,
      authors: extractedMetadata.authors,
    };
  }

  throw new InvalidMangaBakaPageError();
}

async function extractMetadataFromActiveTab(): Promise<ExtractedMetadataPayload | null> {
  const tabId = await resolveUsableTabId();
  if (tabId == null) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const normalizeTitle = (title: string): string =>
          title
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

        const dedupeTitles = (titles: string[]): string[] => {
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
        };

        const asString = (value: unknown): string => (typeof value === "string" ? value : "");
        const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
        const asAuthorNames = (value: unknown): string[] =>
          Array.isArray(value)
            ? value
                .map((author) => (author && typeof author === "object" ? asString((author as Record<string, unknown>).name) : ""))
                .filter(Boolean)
            : [];

        const extractTitleCandidatesFromDocument = (): string[] => {
          const candidates: string[] = [];
          const pageTitle = document.title.replace(/\s+manga information$/i, "").trim();
          if (pageTitle) {
            const pageTitleMatch = pageTitle.match(/^(.+?)\s*\((.+)\)$/);
            if (pageTitleMatch) {
              candidates.push(pageTitleMatch[1], pageTitleMatch[2]);
            } else {
              candidates.push(pageTitle);
            }
          }

          const heading = document.querySelector("h1");
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
        };

        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of scripts) {
          const textContent = script.textContent?.trim();
          if (!textContent) {
            continue;
          }

          try {
            const data = JSON.parse(textContent) as Record<string, unknown>;
            if (data["@type"] !== "CreativeWork") {
              continue;
            }

            const titles = dedupeTitles([
              ...extractTitleCandidatesFromDocument(),
              asString(data.alternativeHeadline),
              ...asStringArray(data.alternateName),
              asString(data.name),
            ]);
            if (titles.length > 0) {
              return { titles, authors: asAuthorNames(data.author) };
            }
          } catch {
          }
        }

        const fallbackTitles = extractTitleCandidatesFromDocument();
        return fallbackTitles.length > 0 ? { titles: fallbackTitles, authors: [] } : null;
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

function extractMetadataFromHtml(html: string): ExtractedMetadataPayload | null {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const fallbackTitles = extractTitleCandidatesFromDocument(documentNode);
  const scripts = Array.from(documentNode.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    const textContent = script.textContent?.trim();
    if (!textContent) {
      continue;
    }

    try {
      const data = JSON.parse(textContent) as Record<string, unknown>;
      if (data["@type"] !== "CreativeWork") {
        continue;
      }

      const titles = dedupeTitles([
        ...fallbackTitles,
        asString(data.alternativeHeadline),
        ...asStringArray(data.alternateName),
        asString(data.name),
      ]);
      if (titles.length > 0) {
        return { titles, authors: asAuthorNames(data.author) };
      }
    } catch {
    }
  }

  return fallbackTitles.length > 0 ? { titles: fallbackTitles, authors: [] } : null;
}

async function searchProviders(
  metadata: MangaBakaMetadata,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
): Promise<LookupResults> {
  const atsu = currentSettings.enabledProviders.atsu ? await searchAtsumaru(metadata, rejectedUrls.atsu, titleAttemptIndexes.atsu) : null;
  const mangadex = currentSettings.enabledProviders.mangadex ? await searchMangaDex(metadata, rejectedUrls.mangadex, titleAttemptIndexes.mangadex) : null;
  const ehentai = currentSettings.enabledProviders.ehentai ? await searchEHentai(metadata, rejectedUrls.ehentai, titleAttemptIndexes.ehentai, "e-hentai") : null;
  const exhentai = currentSettings.enabledProviders.exhentai ? await searchEHentai(metadata, rejectedUrls.exhentai, titleAttemptIndexes.exhentai, "exhentai") : null;
  const comixto = null;
  const mangafire = currentSettings.enabledProviders.mangafire ? await searchMangaFire(metadata, rejectedUrls.mangafire, titleAttemptIndexes.mangafire) : null;
  const weebcentral = currentSettings.enabledProviders.weebcentral ? await searchWeebCentral(metadata, rejectedUrls.weebcentral, titleAttemptIndexes.weebcentral) : null;

  return { atsu, mangadex, ehentai, exhentai, comixto, mangafire, weebcentral };
}

async function searchProvider(
  providerKey: ProviderKey,
  metadata: MangaBakaMetadata,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
): Promise<ProviderMatch | null> {
  switch (providerKey) {
    case "atsu":
      return searchAtsumaru(metadata, rejectedUrls.atsu, titleAttemptIndexes.atsu);
    case "mangadex":
      return searchMangaDex(metadata, rejectedUrls.mangadex, titleAttemptIndexes.mangadex);
    case "ehentai":
      return searchEHentai(metadata, rejectedUrls.ehentai, titleAttemptIndexes.ehentai, "e-hentai");
    case "exhentai":
      return searchEHentai(metadata, rejectedUrls.exhentai, titleAttemptIndexes.exhentai, "exhentai");
    case "comixto":
      return null;
    case "mangafire":
      return searchMangaFire(metadata, rejectedUrls.mangafire, titleAttemptIndexes.mangafire);
    case "weebcentral":
      return searchWeebCentral(metadata, rejectedUrls.weebcentral, titleAttemptIndexes.weebcentral);
    default:
      return null;
  }
}

async function searchAtsumaru(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderMatch | null> {
  const rejectedUrlSet = new Set(rejectedUrls);
  const normalizedSourceTitles = metadata.titles.map(normalizeTitle).filter(Boolean);
  const candidates = new Map<string, { id: string; title: string; score: number }>();
  const title = metadata.titles[titleIndex];
  if (!title) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({
      q: title,
      query_by: "title,otherNames",
      include_fields: "id,title,otherNames,hidden",
      filter_by: "hidden:=false",
      per_page: "20",
    });
    const response = await fetch(`https://atsu.moe/collections/manga/documents/search?${searchParams.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AtsuSearchResponse;
    for (const hit of payload.hits ?? []) {
      const document = hit.document;
      if (!document?.id || document.hidden) {
        continue;
      }

      const titles = dedupeTitles([document.title ?? "", ...(document.otherNames ?? [])]);
      if (titles.length === 0) {
        continue;
      }

      const displayTitle = pickPreferredTitle(titles);
      const url = `https://atsu.moe/manga/${document.id}`;
      if (rejectedUrlSet.has(url)) {
        continue;
      }

      const score = Math.max(0, ...titles.map((entryTitle) => scoreTitleMatch(entryTitle, normalizedSourceTitles)));
      if (score < 90) {
        continue;
      }

      const existingCandidate = candidates.get(document.id);
      if (!existingCandidate || score > existingCandidate.score) {
        candidates.set(document.id, { id: document.id, title: displayTitle, score });
      }
    }
  } catch {
    return null;
  }

  const bestMatch = pickBestCandidate(candidates);
  if (!bestMatch) {
    return null;
  }

  return {
    provider: "Atsumaru",
    title: bestMatch.title,
    url: `https://atsu.moe/manga/${bestMatch.id}`,
    latestChapterNumber: await fetchAtsumaruLatestChapterNumber(bestMatch.id),
    latestChapterLanguage: "en",
  };
}

async function fetchAtsumaruLatestChapterNumber(mangaId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://atsu.moe/api/manga/page?id=${encodeURIComponent(mangaId)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AtsuMangaPageResponse;
    const chapters = payload.mangaPage?.chapters ?? [];
    const sortedChapters = [...chapters].sort((left, right) => {
      const chapterDiff = toChapterSortValue(right.number) - toChapterSortValue(left.number);
      if (chapterDiff !== 0) {
        return chapterDiff;
      }

      const indexDiff = (right.index ?? 0) - (left.index ?? 0);
      if (indexDiff !== 0) {
        return indexDiff;
      }

      return (right.createdAt ?? 0) - (left.createdAt ?? 0);
    });

    for (const chapter of sortedChapters) {
      const titledPageNumber = formatAtsumaruChapterLabel(chapter.title, chapter.number);
      if (titledPageNumber) {
        return titledPageNumber;
      }

      const chapterNumber = formatChapterNumber(chapter.number);
      if (chapterNumber) {
        return chapterNumber;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function searchMangaDex(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
): Promise<ProviderMatch | null> {
  const rejectedUrlSet = new Set(rejectedUrls);
  const normalizedSourceTitles = metadata.titles.map(normalizeTitle).filter(Boolean);
  const candidates = new Map<string, { id: string; title: string; score: number }>();
  const title = metadata.titles[titleIndex];
  if (!title) {
    return null;
  }

  try {
    const response = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=10`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as MangaDexResponse;
    for (const entry of payload.data ?? []) {
      const titles = getMangaDexTitles(entry);
      const score = Math.max(0, ...titles.map((entryTitle) => scoreTitleMatch(entryTitle, normalizedSourceTitles)));
      if (score < 90) {
        continue;
      }

      const displayTitle = pickPreferredTitle(titles);
      const url = `https://mangadex.org/title/${entry.id}/${slugifyTitle(displayTitle)}`;
      if (rejectedUrlSet.has(url)) {
        continue;
      }

      const existingCandidate = candidates.get(entry.id);
      if (!existingCandidate || score > existingCandidate.score) {
        candidates.set(entry.id, { id: entry.id, title: displayTitle, score });
      }
    }
  } catch {
    return null;
  }

  const bestMatch = pickBestCandidate(candidates);
  if (!bestMatch) {
    return null;
  }

  const latestEnglishChapterInfo = await fetchMangaDexLatestEnglishChapterInfo(bestMatch.id);
  return {
    provider: "MangaDex",
    title: bestMatch.title,
    url: `https://mangadex.org/title/${bestMatch.id}/${slugifyTitle(bestMatch.title)}`,
    latestChapterNumber: latestEnglishChapterInfo.latestChapterNumber,
    latestChapterLanguage: latestEnglishChapterInfo.latestChapterLanguage,
    mangaDexChapterState: latestEnglishChapterInfo.mangaDexChapterState,
    manualPurgedChapterNumber: null,
    manualMangaDexChapterState: null,
  };
}

async function fetchMangaDexLatestEnglishChapterInfo(
  mangaId: string,
): Promise<Pick<ProviderMatch, "latestChapterNumber" | "latestChapterLanguage" | "mangaDexChapterState">> {
  try {
    const response = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(mangaId)}/feed?translatedLanguage[]=en&order[publishAt]=desc&limit=25`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      return {
        latestChapterNumber: null,
        latestChapterLanguage: null,
        mangaDexChapterState: "purged",
      };
    }

    const payload = (await response.json()) as MangaDexFeedResponse;
    for (const chapter of payload.data ?? []) {
      if (chapter.attributes?.translatedLanguage !== "en") {
        continue;
      }

      const chapterNumber = formatChapterNumber(chapter.attributes?.chapter ?? null);
      if (chapterNumber) {
        return {
          latestChapterNumber: chapterNumber,
          latestChapterLanguage: "en",
          mangaDexChapterState: null,
        };
      }
    }

    const hasAnyChapters = await fetchMangaDexHasAnyChapters(mangaId);
    if (hasAnyChapters) {
      return {
        latestChapterNumber: null,
        latestChapterLanguage: null,
        mangaDexChapterState: "purged",
      };
    }

    const hasUnavailableChapters = await fetchMangaDexHasUnavailableChapters(mangaId);
    return {
      latestChapterNumber: null,
      latestChapterLanguage: null,
      mangaDexChapterState: hasUnavailableChapters ? "purged" : "no_chapters_tld",
    };
  } catch {
    return {
      latestChapterNumber: null,
      latestChapterLanguage: null,
      mangaDexChapterState: "purged",
    };
  }
}

async function fetchMangaDexHasAnyChapters(mangaId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(mangaId)}/feed?order[publishAt]=desc&limit=1`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      return true;
    }

    const payload = (await response.json()) as MangaDexFeedResponse;
    return (payload.data?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

async function fetchMangaDexHasUnavailableChapters(mangaId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.mangadex.org/manga/${encodeURIComponent(mangaId)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return true;
    }

    const payload = (await response.json()) as MangaDexMangaResponse;
    const availableTranslatedLanguages = payload.data?.attributes?.availableTranslatedLanguages ?? [];
    const latestUploadedChapter = payload.data?.attributes?.latestUploadedChapter;
    return availableTranslatedLanguages.length > 0 || (typeof latestUploadedChapter === "string" && latestUploadedChapter.length > 0);
  } catch {
    return true;
  }
}

async function searchEHentai(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
  domain: "e-hentai" | "exhentai",
): Promise<ProviderMatch | null> {
  const rejectedUrlSet = new Set(rejectedUrls);
  const normalizedSourceTitles = metadata.titles.map(normalizeTitle).filter(Boolean);
  const queryTitles = buildEHentaiQueryTitles(metadata.titles.slice(titleIndex));
  if (queryTitles.length === 0) {
    return null;
  }
  const candidates = new Map<string, { url: string; title: string; score: number }>();

  for (const title of queryTitles) {
    let html = "";
    try {
      const response = await fetch(`https://${domain}.org/?f_search=${encodeURIComponent(title)}`, {
        headers: { accept: "text/html" },
        credentials: "include",
      });
      if (!response.ok) {
        continue;
      }

      html = await response.text();
    } catch {
    }

    const searchResults = extractEHentaiSearchResults(html, domain);
    for (const result of searchResults) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(result.url);
      } catch {
        continue;
      }

      const canonicalUrl = canonicalizeEHentaiGalleryUrl(parsedUrl, domain);
      if (!canonicalUrl || rejectedUrlSet.has(canonicalUrl)) {
        continue;
      }

      const candidateTitles = extractEHentaiTitleCandidates(result.title);
      const score = Math.max(0, ...candidateTitles.map((candidateTitle) => scoreTitleMatch(candidateTitle, normalizedSourceTitles)));
      if (score < 90) {
        continue;
      }

      const displayTitle = cleanEHentaiGalleryTitle(result.title) || result.title;
      const existingCandidate = candidates.get(canonicalUrl);
      if (!existingCandidate || score > existingCandidate.score) {
        candidates.set(canonicalUrl, { url: canonicalUrl, title: displayTitle, score });
      }
    }
  }

  const bestMatch = pickBestCandidate(candidates);
  if (!bestMatch) {
    return null;
  }

  return {
    provider: domain === "e-hentai" ? "E-Hentai" : "ExHentai",
    title: bestMatch.title,
    url: bestMatch.url,
    latestChapterNumber: null,
    latestChapterLanguage: null,
  };
}

async function searchMangaFire(metadata: MangaBakaMetadata, rejectedUrls: string[], titleIndex: number): Promise<ProviderMatch | null> {
  return searchViaYahoo(metadata, rejectedUrls, titleIndex, {
    provider: "MangaFire",
    siteQuery: "site:mangafire.to/manga",
    matchUrl(url) {
      return url.hostname === "mangafire.to" && url.pathname.startsWith("/manga/");
    },
    canonicalizeUrl(url) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2 || segments[0] !== "manga") {
        return null;
      }

      return `https://mangafire.to/manga/${segments[1]}`;
    },
    getCandidateTitles(result, url) {
      return dedupeTitles([
        cleanMangaFireResultTitle(result.title),
        getMangaFireTitleFromUrl(url),
      ]);
    },
    getDisplayTitle(result, url) {
      return getMangaFireTitleFromUrl(url) || cleanMangaFireResultTitle(result.title) || "MangaFire";
    },
  });
}

async function searchWeebCentral(metadata: MangaBakaMetadata, rejectedUrls: string[], titleIndex: number): Promise<ProviderMatch | null> {
  return searchViaYahoo(metadata, rejectedUrls, titleIndex, {
    provider: "WeebCentral",
    siteQuery: "site:weebcentral.com/series",
    matchUrl(url) {
      return url.hostname === "weebcentral.com" && url.pathname.startsWith("/series/");
    },
    canonicalizeUrl(url) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 3 || segments[0] !== "series") {
        return null;
      }

      return `https://weebcentral.com/series/${segments[1]}/${segments[2]}`;
    },
    getCandidateTitles(result, url) {
      return dedupeTitles([
        cleanWeebCentralResultTitle(result.title),
        getWeebCentralTitleFromUrl(url),
      ]);
    },
    getDisplayTitle(result, url) {
      return getWeebCentralTitleFromUrl(url) || cleanWeebCentralResultTitle(result.title) || "WeebCentral";
    },
  });
}

async function searchViaYahoo(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
  config: {
    provider: ProviderMatch["provider"];
    siteQuery: string;
    matchUrl: (url: URL) => boolean;
    canonicalizeUrl: (url: URL) => string | null;
    getCandidateTitles: (result: SearchResultEntry, url: URL) => string[];
    getDisplayTitle: (result: SearchResultEntry, url: URL) => string;
  },
): Promise<ProviderMatch | null> {
  const rejectedUrlSet = new Set(rejectedUrls);
  const normalizedSourceTitles = metadata.titles.map(normalizeTitle).filter(Boolean);
  const title = metadata.titles[titleIndex];
  if (!title) {
    return null;
  }

  let html = "";
  try {
    const response = await fetch(
      `https://search.yahoo.com/search?p=${encodeURIComponent(`${config.siteQuery} ${title}`)}`,
      { headers: { accept: "text/html" } },
    );
    if (!response.ok) {
      return null;
    }

    html = await response.text();
  } catch {
    return null;
  }

  const searchResults = extractYahooSearchResults(html);
  const candidates = new Map<string, { url: string; title: string; score: number }>();

  for (const result of searchResults) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(result.url);
    } catch {
      continue;
    }

    if (!config.matchUrl(parsedUrl)) {
      continue;
    }

    const canonicalUrl = config.canonicalizeUrl(parsedUrl);
    if (!canonicalUrl || rejectedUrlSet.has(canonicalUrl)) {
      continue;
    }

    const candidateTitles = config.getCandidateTitles(result, parsedUrl);
    const score = Math.max(0, ...candidateTitles.map((candidateTitle) => scoreTitleMatch(candidateTitle, normalizedSourceTitles)));
    if (score < 90) {
      continue;
    }

    const displayTitle = config.getDisplayTitle(result, parsedUrl);
    const existingCandidate = candidates.get(canonicalUrl);
    if (!existingCandidate || score > existingCandidate.score) {
      candidates.set(canonicalUrl, { url: canonicalUrl, title: displayTitle, score });
    }
  }

  const bestMatch = pickBestCandidate(candidates);
  if (!bestMatch) {
    return null;
  }

  return {
    provider: config.provider,
    title: bestMatch.title,
    url: bestMatch.url,
    latestChapterNumber: null,
    latestChapterLanguage: null,
  };
}

function extractYahooSearchResults(html: string): SearchResultEntry[] {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(documentNode.querySelectorAll<HTMLAnchorElement>('a[href^="https://r.search.yahoo.com/"]'));
  const seenUrls = new Set<string>();
  const results: SearchResultEntry[] = [];

  for (const anchor of anchors) {
    const redirectUrl = anchor.getAttribute("href")?.trim();
    if (!redirectUrl) {
      continue;
    }

    const decodedUrl = decodeYahooRedirectUrl(redirectUrl);
    if (!decodedUrl || !decodedUrl.startsWith("http") || seenUrls.has(decodedUrl)) {
      continue;
    }

    const title = anchor.textContent?.trim() ?? "";
    if (!title) {
      continue;
    }

    seenUrls.add(decodedUrl);
    results.push({ url: decodedUrl, title, cite: "" });
  }

  return results;
}

function decodeYahooRedirectUrl(redirectUrl: string): string | null {
  const match = redirectUrl.match(/\/RU=([^/]+)\//);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function asAuthorNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((author) => (author && typeof author === "object" ? asString((author as Record<string, unknown>).name) : ""))
    .filter(Boolean);
}

async function getAlternatingInactiveTitleMarkup(): Promise<string> {
  const storageKey = "ui:inactiveTitleVariant";
  const stored = await chrome.storage.local.get(storageKey);
  const nextVariant = stored[storageKey] === "jp-first" ? "en-first" : "jp-first";
  void chrome.storage.local.set({ [storageKey]: nextVariant });

  return nextVariant === "jp-first"
    ? '<span class="brand-white">マンガ</span> <span class="brand-red">Baka</span>'
    : '<span class="brand-white">Manga</span> <span class="brand-red">バカ</span>';
}

async function renderUnsupportedState(): Promise<void> {
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
  clearPendingConfirmation();
  const resultsNode = getResultsNode();
  resultsNode.innerHTML = "";

  for (const provider of getVisibleProviders()) {
    const row = document.createElement("div");
    row.className = "provider-row provider-row--loading";

    const label = document.createElement("div");
    label.className = `provider-label provider-label--${currentSettings.providerLabelMode}`;
    label.innerHTML = getProviderLabelMarkup(provider.key, getProviderDisplayLabel(provider.key));

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
  getTitleNode().textContent = cache.primaryTitle;

  getSubtitleNode().textContent = cache.authors[0] ? `by ${cache.authors[0]}` : "";
  renderProviderRows(cache.results, {
    cache,
    emptyLabel: "No Match Found",
    enableProviderReset: true,
  });
  const hasEnabledProviders = getVisibleProviders().length > 0;
  setStatus(
    hasEnabledProviders ? (fromCache ? "Loaded cached result" : "Search complete") : "No providers enabled",
    hasEnabledProviders ? "success" : "error",
  );
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

function renderProviderPageState(context: ProviderPageContext): void {
  if (!currentSettings.enabledProviders[context.providerKey]) {
    void renderUnsupportedState();
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

    const label = document.createElement("div");
    label.className = `provider-label provider-label--${currentSettings.providerLabelMode}`;
    label.innerHTML = getProviderLabelMarkup(provider.key, getProviderDisplayLabel(provider.key));

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
          ? `Search MangaBaka for ${context.primaryTitle} in ${currentSettings.providerLinkType === "new" ? "a new tab" : "the current tab"}`
          : "Search MangaBaka is only available on supported series and chapter pages",
        !context.isSearchable,
        () => {
          if (!context.isSearchable) {
            return;
          }

          void openMangaBakaSearch(context.primaryTitle);
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
    const retryBusy = retryInProgress[provider.key] === true;
    const canSearchNow = Boolean(options.cache) && providerEnabled && !providerSearched && !providerResult;
    const attemptIndex = options.cache?.titleAttemptIndexes?.[provider.key] ?? 0;
    const titleCount = options.cache?.titles.length ?? 0;
    const hasNextTitle = attemptIndex < titleCount - 1;
    const isExhausted =
      providerSearched && !providerResult && providerEnabled && titleCount > 0 && !hasNextTitle && attemptIndex > 0 && options.emptyLabel === "No Match Found";
    const row = document.createElement("div");
    row.className = "provider-row";

    const label = document.createElement("div");
    label.className = `provider-label provider-label--${currentSettings.providerLabelMode}`;
    label.innerHTML = getProviderLabelMarkup(provider.key, providerLabel);

    const value = document.createElement("div");
    value.className = "provider-value";
    if (!providerResult) {
      value.classList.add("provider-value--na");
    }

    const main = document.createElement("div");
    main.className = "provider-value-main";
    if (!providerEnabled) {
      main.textContent = "N/A";
    } else if (canSearchNow) {
      main.textContent = "Ready to search";
    } else if (providerResult) {
      main.textContent = providerResult.title;
    } else if (isExhausted) {
      main.textContent = "All attempts exhausted";
    } else {
      main.textContent = options.emptyLabel;
    }

    const meta = document.createElement("div");
    meta.className = "provider-value-meta";
    const mangaDexChapterState = provider.key === "mangadex" ? getMangaDexChapterState(providerResult) : null;
    if (provider.key === "mangadex" && providerResult) {
      if (mangaDexChapterState === "available" && providerResult.latestChapterNumber) {
        const latestLabel = `Ch. ${providerResult.latestChapterNumber.replace(/^page\.\s*/i, "")}`;
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>${escapeHtml(latestLabel)}</span>`;
      } else if (mangaDexChapterState === "no_chapters_tld") {
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>No Chapters TL'd</span>`;
      } else {
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>Purged</span>`;
        meta.append(createStatusIconSvg("provider-value-status-icon", "pensive"));
      }

      if (canToggleMangaDexChapterState(providerResult)) {
        meta.onclick = () => {
          void toggleMangaDexPurgedState();
        };
      }
    } else if (providerResult?.latestChapterNumber) {
      const latestLabel = `Ch. ${providerResult.latestChapterNumber.replace(/^page\.\s*/i, "")}`;
      meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>${escapeHtml(latestLabel)}</span>`;
    } else if (providerResult) {
      if (provider.key === "mangafire" || provider.key === "weebcentral") {
        meta.textContent = "Cloudflare Error";
      } else {
        meta.textContent = "";
      }
    } else if (!providerEnabled) {
      meta.textContent = "Disabled";
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

    const copyButton = buildActionButton(
      isReadLinkSaveArmed ? "icon-button icon-button--save-read-link" : "icon-button",
      isReadLinkSaveArmed ? SAVE_READ_LINK_ICON : COPY_ICON,
      providerResult
        ? isReadLinkSaveArmed
          ? `Save ${providerLabel} as MangaBaka Read Link`
          : `Copy ${providerLabel} link`
        : `${providerLabel} unavailable`,
      !providerResult,
      () => {
        if (!providerResult) {
          return;
        }

        if (isReadLinkSaveArmed) {
          void saveReadLink(provider.key, providerResult.url, providerLabel);
          return;
        }

        void copyLink(provider.key, providerResult.url, providerLabel);
      },
    );

    const openButton = buildActionButton(
      "icon-button",
      OPEN_ICON,
      providerResult
        ? `Open ${providerLabel} in ${currentSettings.providerLinkType === "new" ? "a new tab" : "the current tab"}`
        : `${providerLabel} unavailable`,
      !providerResult,
      () => {
        if (!providerResult) {
          return;
        }

        void openProviderUrl(providerResult.url, providerLabel);
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

        void handleProviderRetry(provider.key);
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

        void handleProviderSearchNow(provider.key);
      },
    );

    const incorrectButton = buildActionButton(
      "icon-button icon-button--reset",
      INCORRECT_ICON,
      providerResult ? `Mark the current ${providerLabel} result incorrect and search again` : `${providerLabel} unavailable`,
      !providerResult || !options.enableProviderReset || !providerEnabled,
      (button) => {
        if (!providerResult || !options.enableProviderReset || !providerEnabled) {
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
      !providerResult || !shouldShowRefreshButton,
      () => {
        if (!providerResult || !shouldShowRefreshButton) {
          return;
        }

        void handleProviderRefresh(provider.key);
      },
    );

    if (providerResult) {
      actions.append(copyButton, openButton, shouldShowRefreshButton ? refreshButton : incorrectButton);
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

function getProviderIconPath(providerKey: ProviderKey): string {
  const filename = providerKey === "exhentai" ? "ehentai" : providerKey;
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
        renderProviderPageState(currentProviderPage);
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
    await openUrlWithPreference(url, currentSettings.providerLinkType);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : `Unable to open ${providerLabel}`, "error");
  }
}

async function openMangaBakaSearch(title: string): Promise<void> {
  try {
    await openUrlWithPreference(buildMangaBakaSearchUrl(title), currentSettings.providerLinkType);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to search MangaBaka", "error");
  }
}

async function handleProviderRefresh(providerKey: ProviderKey): Promise<void> {
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
      refreshedMetadata = (await fetchMangaDexProviderPageMetadata(currentResult.url, "series"))
        ?? extractGenericProviderPageMetadataFromDocument(providerKey, document);
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

  let latestChapterNumber = currentResult.latestChapterNumber;
  let latestChapterLanguage = currentResult.latestChapterLanguage;
  let mangaDexChapterState = currentResult.mangaDexChapterState ?? null;
  if (providerKey === "atsu") {
    const mangaId = getAtsumaruMangaIdFromUrl(currentResult.url);
    if (mangaId) {
      latestChapterNumber = await fetchAtsumaruLatestChapterNumber(mangaId);
      latestChapterLanguage = "en";
    }
  } else if (providerKey === "mangadex") {
    const mangaId = getMangaDexMangaIdFromUrl(currentResult.url);
    if (mangaId) {
      const latestEnglishChapterInfo = await fetchMangaDexLatestEnglishChapterInfo(mangaId);
      latestChapterNumber = latestEnglishChapterInfo.latestChapterNumber;
      latestChapterLanguage = latestEnglishChapterInfo.latestChapterLanguage;
      mangaDexChapterState = latestEnglishChapterInfo.mangaDexChapterState ?? null;
    }
  }

  const title = refreshedMetadata?.titles.length ? pickPreferredTitle(refreshedMetadata.titles) : currentResult.title;
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
  currentCache = updatedCache;
  rerenderCurrentResultsOnly();
  setStatus(changed ? `Updated cached ${providerLabel} result` : `No changes found for ${providerLabel}`, "success");
}

async function copyLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  await navigator.clipboard.writeText(url);
  armedReadLinkSaves = { [providerKey]: url };
  rerenderCurrentResultsOnly();
  setStatus(`${providerLabel} link copied`, "success");
}

async function toggleMangaDexPurgedState(): Promise<void> {
  if (!currentCache) {
    return;
  }

  const currentResult = currentCache.results.mangadex;
  if (!currentResult || currentResult.provider !== "MangaDex" || !canToggleMangaDexChapterState(currentResult)) {
    return;
  }

  const mangaDexResult = currentResult;
  const mangaDexChapterState = getMangaDexChapterState(mangaDexResult);
  const baseMangaDexChapterState = mangaDexResult.mangaDexChapterState === "no_chapters_tld" ? "no_chapters_tld" : "purged";
  let updatedResult: ProviderMatch;
  let statusMessage: string;

  if (mangaDexChapterState === "available" && mangaDexResult.latestChapterNumber) {
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
      mangaDexChapterState: null,
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
      manualMangaDexChapterState: baseMangaDexChapterState === "no_chapters_tld" ? null : "no_chapters_tld",
    };
    statusMessage = "MangaDex marked as having no translated chapters";
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
  currentCache = updatedCache;
  rerenderCurrentResultsOnly();
  setStatus(statusMessage, "success");
}

async function saveReadLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  const tabId = await resolveUsableTabId();
  if (tabId == null) {
    setStatus("No active MangaBaka tab available", "error");
    return;
  }

  setStatus(`Saving ${providerLabel} as Read Link...`, "loading");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [url],
      func: async (readLinkUrl: string) => {
        const sleep = (ms: number): Promise<void> =>
          new Promise((resolve) => {
            window.setTimeout(resolve, ms);
          });

        const isVisible = (element: Element | null): element is HTMLElement => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };

        const getElementText = (element: Element | null): string =>
          element?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";

        const normalizeFieldText = (value: string): string =>
          value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

        const getElementIdentity = (element: Element | null): string => {
          if (!(element instanceof HTMLElement)) {
            return "";
          }

          return [
            getElementText(element),
            element.getAttribute("aria-label") ?? "",
            element.getAttribute("title") ?? "",
            element.getAttribute("data-slot") ?? "",
            element.getAttribute("data-state") ?? "",
            element.className,
          ]
            .join(" ")
            .toLowerCase();
        };

        const SERIES_EDITOR_TRIGGER_SELECTOR =
          "button[data-dialog-trigger][data-slot='sheet-trigger'][aria-haspopup='dialog'], [data-dialog-trigger][data-slot='sheet-trigger'][aria-haspopup='dialog']";

        const findLibrarySection = (): HTMLElement | null => {
          const heading = Array.from(document.querySelectorAll("h2, h3, h4, h5, div, span, p"))
            .find((element) => isVisible(element) && getElementText(element) === "my library");

          if (!(heading instanceof HTMLElement)) {
            return null;
          }

          return (
            heading.closest("article, section, [class*='card'], [class*='group']") ??
            heading.parentElement ??
            heading.closest("div") ??
            null
          );
        };

        const findAddToLibraryButton = (): HTMLElement | null =>
          Array.from(document.querySelectorAll("button, a, a[role='button'], [data-slot='button']"))
            .filter((element): element is HTMLElement => isVisible(element))
            .find((element) => {
              const text = getElementText(element);
              return (
                text === "add series to my library" ||
                text === "add to my library" ||
                text.includes("add series to my library")
              );
            }) ?? null;

        const getSeriesEditorContextText = (element: HTMLElement): string => {
          const containers = [
            element.closest("article"),
            element.closest("section"),
            element.closest("[class*='card']"),
            element.closest("[class*='group']"),
            element.parentElement,
            element.parentElement?.parentElement,
          ].filter((container): container is HTMLElement => Boolean(container));

          return containers
            .map((container) => normalizeFieldText(container.textContent ?? ""))
            .find((text) => text.length > 0) ?? "";
        };

        const scoreSeriesEditorTrigger = (element: HTMLElement, librarySection: HTMLElement | null): number => {
          const identity = getElementIdentity(element);
          const context = getSeriesEditorContextText(element);
          let score = 0;

          const sameSection = Boolean(librarySection && librarySection.contains(element));

          if (identity.includes("add series to my library") || identity.includes("add to my library")) {
            return -1000;
          }
          if (identity.includes("report") || context.includes("report an issue")) {
            return -1000;
          }
          if (identity.includes("edit series") && !context.includes("my library")) {
            return -1000;
          }

          score += 40;
          if (sameSection) {
            score += 120;
          }
          if (context.includes("my library")) {
            score += 180;
          }
          if (element.matches(SERIES_EDITOR_TRIGGER_SELECTOR)) {
            score += 120;
          }
          if (identity.includes("edit series") || identity.includes("update series")) {
            score += 60;
          }
          if (identity.includes("edit")) {
            score += 25;
          }
          if (identity.includes("update")) {
            score += 20;
          }
          if (identity.includes("library")) {
            score += 15;
          }
          if (identity.includes("entry")) {
            score += 15;
          }
          if (identity.includes("remove") || identity.includes("delete")) {
            score -= 100;
          }
          if (identity.includes("lucide-pencil") || element.innerHTML.toLowerCase().includes("lucide-pencil")) {
            score += 60;
          }
          if (element.id.startsWith("bits-")) {
            score += 10;
          }
          if (identity.includes("bg-secondary") || identity.includes("text-secondary-foreground")) {
            score += 10;
          }
          if (identity.includes("list") || identity.includes("rating") || identity.includes("note")) {
            score -= 25;
          }
          if (element.getAttribute("aria-haspopup") === "dialog") {
            score += 10;
          }
          if (element.querySelector("svg")) {
            score += 5;
          }
          if (!getElementText(element)) {
            score += 5;
          }
          if (element instanceof HTMLAnchorElement && element.href && !element.href.startsWith(window.location.origin)) {
            score -= 50;
          }

          return score;
        };

        const activateElement = async (element: HTMLElement): Promise<void> => {
          element.focus();

          const pointerDown = new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: 1,
          });
          const mouseDown = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 1,
          });
          const pointerUp = new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: 0,
          });
          const mouseUp = new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 0,
          });
          const click = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 0,
          });

          element.dispatchEvent(pointerDown);
          element.dispatchEvent(mouseDown);
          element.dispatchEvent(pointerUp);
          element.dispatchEvent(mouseUp);
          if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) {
            element.click();
          } else {
            element.dispatchEvent(click);
          }
          await sleep(125);
          if (element.getAttribute("aria-haspopup") === "dialog" && element.getAttribute("aria-expanded") !== "true") {
            const enterDown = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            const enterUp = new KeyboardEvent("keyup", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            const spaceDown = new KeyboardEvent("keydown", {
              key: " ",
              code: "Space",
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            const spaceUp = new KeyboardEvent("keyup", {
              key: " ",
              code: "Space",
              bubbles: true,
              cancelable: true,
              composed: true,
            });

            element.dispatchEvent(enterDown);
            element.dispatchEvent(enterUp);
            await sleep(125);
            if (element.getAttribute("aria-expanded") !== "true") {
              element.dispatchEvent(spaceDown);
              element.dispatchEvent(spaceUp);
            }
          }
          await sleep(50);
        };

        const getVisibleInputs = (root: Document | Element): Array<HTMLInputElement | HTMLTextAreaElement> =>
          Array.from(root.querySelectorAll("input, textarea")).filter(
            (element): element is HTMLInputElement | HTMLTextAreaElement => isVisible(element),
          );

        const getAllInputs = (root: Document | Element): Array<HTMLInputElement | HTMLTextAreaElement> =>
          Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));

        const getFieldIdentity = (input: HTMLInputElement | HTMLTextAreaElement): string =>
          normalizeFieldText(
            `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute("aria-label") ?? ""} ${input.type}`,
          );

        const pickBestReadLinkInput = (
          inputs: Array<HTMLInputElement | HTMLTextAreaElement>,
        ): HTMLInputElement | HTMLTextAreaElement | null => {
          const exactNameMatch = inputs.find((input) => {
            const identity = getFieldIdentity(input);
            return identity.includes("read link") || identity.includes("read_link");
          });
          if (exactNameMatch) {
            return exactNameMatch;
          }

          const directMatch = inputs.find((input) => {
            const identity = getFieldIdentity(input);
            return identity.includes("read") && identity.includes("link");
          });
          if (directMatch) {
            return directMatch;
          }

          return inputs.length === 1 ? inputs[0] : null;
        };

        const findReadLinkInput = (allowHidden = false): HTMLInputElement | HTMLTextAreaElement | null => {
          const selectorMatch = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            "input[name='read_link'], textarea[name='read_link'], input[name*='read_link' i], textarea[name*='read_link' i], input[id*='read_link' i], textarea[id*='read_link' i]",
          );
          if (selectorMatch && (allowHidden || isVisible(selectorMatch))) {
            return selectorMatch;
          }

          const directMatch = pickBestReadLinkInput(allowHidden ? getAllInputs(document) : getVisibleInputs(document));
          if (directMatch) {
            return directMatch;
          }

          const labelCandidates = Array.from(document.querySelectorAll("label, div, span, p, h3, h4, h5"))
            .filter((element) => (allowHidden || isVisible(element)) && normalizeFieldText(getElementText(element)) === "read link");

          for (const label of labelCandidates) {
            if (label instanceof HTMLLabelElement && label.htmlFor) {
              const labeledInput = document.getElementById(label.htmlFor);
              if (labeledInput instanceof HTMLInputElement || labeledInput instanceof HTMLTextAreaElement) {
                return labeledInput;
              }
            }

            const candidateRoots = [
              label.parentElement,
              label.nextElementSibling,
              label.closest("form"),
              label.closest("aside"),
              label.closest("[role='dialog']"),
              label.closest("[data-slot='sheet-content']"),
              label.closest("[data-slot='drawer-content']"),
            ].filter((root): root is Element => Boolean(root));

            for (const root of candidateRoots) {
              const nestedInput = pickBestReadLinkInput(allowHidden ? getAllInputs(root) : getVisibleInputs(root));
              if (nestedInput) {
                return nestedInput;
              }
            }
          }

          return null;
        };

        const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
          input.focus();
          input.click();
          const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
          descriptor?.set?.call(input, value);
          input.value = value;
          input.setAttribute("value", value);
          if ("setSelectionRange" in input) {
            input.setSelectionRange(value.length, value.length);
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        };

        const findSaveButton = (input: HTMLInputElement | HTMLTextAreaElement, opener?: HTMLElement | null): HTMLElement | null => {
          const scopedContainers = [
            input.closest("form"),
            input.closest("[role='dialog']"),
            input.closest("aside"),
            input.closest("[data-slot='sheet-content']"),
            input.closest("[data-slot='drawer-content']"),
            document.body,
          ].filter((container): container is HTMLElement => Boolean(container));

          for (const container of scopedContainers) {
            const buttons = Array.from(container.querySelectorAll("button, [data-slot='button']"))
              .filter((element): element is HTMLElement => isVisible(element));
            const submitButton = buttons.find((button) => {
              if (button === opener) {
                return false;
              }

              return button instanceof HTMLButtonElement && button.type === "submit";
            });
            if (submitButton) {
              return submitButton;
            }

            const exactMatch = buttons.find((button) => button !== opener && getElementText(button) === "update series");
            if (exactMatch) {
              return exactMatch;
            }

            const partialMatch = buttons.find(
              (button) => button !== opener && (getElementText(button).includes("update series") || getElementText(button) === "save"),
            );
            if (partialMatch) {
              return partialMatch;
            }
          }

          return null;
        };

        const openSeriesEditor = async (): Promise<HTMLElement | null> => {
          const librarySection = findLibrarySection();
          const directTriggers = Array.from(document.querySelectorAll<HTMLElement>(SERIES_EDITOR_TRIGGER_SELECTOR))
            .filter((element) => isVisible(element))
            .map((button) => ({
              button,
              score: scoreSeriesEditorTrigger(button, librarySection),
            }))
            .filter((candidate) => candidate.score > -1000)
            .sort((left, right) => right.score - left.score);

          for (const candidate of directTriggers) {
            await activateElement(candidate.button);
            for (let attempt = 0; attempt < 32; attempt += 1) {
              await sleep(125);
              if (findReadLinkInput()) {
                return candidate.button;
              }
              if (candidate.button.getAttribute("aria-expanded") === "true" && attempt >= 8) {
                const hiddenInput = findReadLinkInput(true);
                if (hiddenInput) {
                  return candidate.button;
                }
              }
            }
          }

          return null;
        };

        let input: HTMLInputElement | HTMLTextAreaElement | null;
        let opener: HTMLElement | null = null;
        input = findReadLinkInput();
        if (!input) {
          if (findAddToLibraryButton()) {
            return { ok: false, error: "You must add the series to your MangaBaka library before saving a Read Link." };
          }

          input = findReadLinkInput(true);
          if (input) {
            opener = null;
          } else {
            opener = await openSeriesEditor();
            if (!opener) {
              return { ok: false, error: "Could not open the MangaBaka library editor." };
            }
          }
        }

        for (let attempt = 0; attempt < 20; attempt += 1) {
          await sleep(150);
          input = findReadLinkInput() ?? findReadLinkInput(true);
          if (input) {
            break;
          }
        }

        if (!input) {
          return { ok: false, error: "Could not find the Read Link field after opening Update series." };
        }

        setInputValue(input, readLinkUrl);
        if (input.value !== readLinkUrl) {
          setInputValue(input, readLinkUrl);
        }

        const saveButton = findSaveButton(input, opener);
        const form = input.form ?? input.closest("form");

        if (form instanceof HTMLFormElement && typeof form.requestSubmit === "function") {
          if (saveButton instanceof HTMLButtonElement || saveButton instanceof HTMLInputElement) {
            form.requestSubmit(saveButton);
          } else {
            form.requestSubmit();
          }
        } else if (saveButton) {
          saveButton.click();
        } else {
          return { ok: false, error: "Could not submit the MangaBaka Read Link form." };
        }

        await sleep(700);

        return { ok: true };
      },
    });

    const result = results?.[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!result?.ok) {
      setStatus(result?.error ?? "Unable to save MangaBaka Read Link.", "error");
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
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function wireTopResetButton(seriesId: string): void {
  getResetButton().onclick = () => {
    requestInlineConfirmation(
      getResetButton(),
      "Press the top-right reset button again to clear the cache and all excluded results.",
      () => handleTopReset(seriesId),
    );
    scrollPopupToBottom();
  };
}

async function handleTopReset(seriesId: string): Promise<void> {
  setStatus("Clearing cached search...", "loading");
  await clearCache(seriesId);
  currentCache = null;
  currentCachedResultFlags = {};

  if (!currentSourceUrl) {
    await renderUnsupportedState();
    return;
  }

  await runLookup(currentSourceUrl, seriesId, createEmptyRejectedProviderUrls(), { ...EMPTY_TITLE_ATTEMPT_INDEXES });
}

async function handleProviderReset(providerKey: ProviderKey): Promise<void> {
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

  const metadata: MangaBakaMetadata = {
    seriesId: currentCache.seriesId,
    sourceUrl: currentCache.sourceUrl,
    primaryTitle: currentCache.primaryTitle,
    titles: [...currentCache.titles],
    authors: [...currentCache.authors],
  };

  setStatus(`Searching for another ${providerLabel} result...`, "loading");
  try {
    const titleAttemptIndexes = { ...currentCache.titleAttemptIndexes };
    const replacement = await searchProvider(providerKey, metadata, rejectedUrls, titleAttemptIndexes);
    const updatedCache: CachedLookup = {
      ...currentCache,
      rejectedUrls,
      results: {
        ...currentCache.results,
        [providerKey]: replacement,
      },
      searchedAt: new Date().toISOString(),
    };

    await saveCache(updatedCache);
    currentCachedResultFlags[providerKey] = false;
    currentCache = updatedCache;
    renderLookup(updatedCache, false);
  } catch (error) {
    currentCache = {
      ...currentCache,
      searchedAt: new Date().toISOString(),
    };
    renderLookup(currentCache, true);
    setStatus(error instanceof Error ? error.message : `Unable to refresh ${providerLabel}`, "error");
  }
}

async function handleProviderRetry(providerKey: ProviderKey): Promise<void> {
  if (!currentCache) {
    return;
  }

  if (retryInProgress[providerKey]) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  const metadata: MangaBakaMetadata = {
    seriesId: currentCache.seriesId,
    sourceUrl: currentCache.sourceUrl,
    primaryTitle: currentCache.primaryTitle,
    titles: [...currentCache.titles],
    authors: [...currentCache.authors],
  };
  const titleCount = currentCache.titles.length;
  let nextTitleIndex = (currentCache.titleAttemptIndexes[providerKey] ?? 0) + 1;
  if (nextTitleIndex >= titleCount) {
    renderLookup(currentCache, true);
    return;
  }

  retryInProgress[providerKey] = true;
  rerenderCurrentResultsOnly();

  try {
    while (currentCache && nextTitleIndex < titleCount) {
      const titleAttemptIndexes = { ...currentCache.titleAttemptIndexes, [providerKey]: nextTitleIndex };
      setStatus(`Trying ${providerLabel} title ${nextTitleIndex + 1} of ${titleCount}...`, "loading");

      const replacement = await searchProvider(providerKey, metadata, currentCache.rejectedUrls, titleAttemptIndexes);
      const updatedCache: CachedLookup = {
        ...currentCache,
        titleAttemptIndexes,
        results: {
          ...currentCache.results,
          [providerKey]: replacement,
        },
        searchedAt: new Date().toISOString(),
      };

      await saveCache(updatedCache);
      currentCachedResultFlags[providerKey] = false;
      currentCache = updatedCache;
      rerenderCurrentResultsOnly();

      if (replacement) {
        setStatus("Search complete", "success");
        return;
      }

      nextTitleIndex += 1;
      if (nextTitleIndex >= titleCount) {
        setStatus(`All ${providerLabel} title attempts exhausted`, "error");
        return;
      }

      for (let countdown = RETRY_COOLDOWN_SECONDS; countdown > 0; countdown -= 1) {
        retryCountdowns[providerKey] = countdown;
        rerenderCurrentResultsOnly();
        setStatus(`Rate limit cooldown: retrying ${providerLabel} in ${countdown}s`, "loading");
        await sleep(1000);
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

async function handleProviderSearchNow(providerKey: ProviderKey): Promise<void> {
  if (!currentCache) {
    return;
  }

  const providerLabel = getProviderDisplayLabel(providerKey);
  const metadata: MangaBakaMetadata = {
    seriesId: currentCache.seriesId,
    sourceUrl: currentCache.sourceUrl,
    primaryTitle: currentCache.primaryTitle,
    titles: [...currentCache.titles],
    authors: [...currentCache.authors],
  };

  setStatus(`Searching ${providerLabel}...`, "loading");

  try {
    const replacement = await searchProvider(providerKey, metadata, currentCache.rejectedUrls, currentCache.titleAttemptIndexes);
    const updatedCache: CachedLookup = {
      ...currentCache,
      searchedProviders: {
        ...currentCache.searchedProviders,
        [providerKey]: true,
      },
      results: {
        ...currentCache.results,
        [providerKey]: replacement,
      },
      searchedAt: new Date().toISOString(),
    };

    await saveCache(updatedCache);
    currentCachedResultFlags[providerKey] = false;
    currentCache = updatedCache;
    renderLookup(updatedCache, false);
  } catch (error) {
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
      void confirmedAction();
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

function getProviderLinkTypeSelect(): HTMLSelectElement {
  return document.getElementById("option-provider-link-type") as HTMLSelectElement;
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

