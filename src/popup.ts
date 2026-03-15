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
  version: 9;
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
    id: string;
    title: string;
    type?: string;
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

interface ExtractedMetadataPayload {
  titles: string[];
  authors: string[];
}

interface BraveSearchResult {
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
  popupMaxHeightPx: number;
  mangaBakaButtonTarget: MangaBakaButtonTarget;
  mangaBakaProfileName: string;
}

type ProviderKey = keyof LookupResults;
type ProviderLabelMode = ExtensionSettings["providerLabelMode"];
type LinkTargetType = "current" | "new";
type MangaBakaButtonTarget = "root" | "library" | "profile";
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
  message: string;
  action: () => Promise<void> | void;
  timeoutId: number;
}

class InvalidMangaBakaPageError extends Error {
  constructor() {
    super("Invalid MangaBaka page.");
    this.name = "InvalidMangaBakaPageError";
  }
}

const CACHE_VERSION = 9;
const SETTINGS_KEY = "extension:settings";
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
const MIN_POPUP_MAX_HEIGHT_PX = 400;
const DEFAULT_POPUP_MAX_HEIGHT_PX = 700;
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
  popupMaxHeightPx: DEFAULT_POPUP_MAX_HEIGHT_PX,
  mangaBakaButtonTarget: DEFAULT_MANGABAKA_BUTTON_TARGET,
  mangaBakaProfileName: "",
};
const EXTENSION_VERSION_NAME = chrome.runtime.getManifest().version_name ?? chrome.runtime.getManifest().version;

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
  <svg viewBox="0 0 24 16" aria-hidden="true">
    <rect width="24" height="16" rx="2" fill="#ffffff"></rect>
    <path d="M0 1.33h24M0 4h24M0 6.67h24M0 9.33h24M0 12h24M0 14.67h24" stroke="#c53030" stroke-width="1.33"></path>
    <rect width="10" height="7.5" fill="#2557a7"></rect>
    <rect width="24" height="16" rx="2" fill="none" stroke="rgba(0,0,0,0.18)"></rect>
  </svg>
`;

const INCORRECT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6 18 18"></path>
    <path d="M18 6 6 18"></path>
  </svg>
`;

let currentSourceUrl = "";
let currentTabId: number | null = null;
let currentCache: CachedLookup | null = null;
let pendingConfirmation: PendingConfirmation | null = null;
let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
let retryCountdowns: Partial<Record<ProviderKey, number>> = {};
let retryInProgress: Partial<Record<ProviderKey, boolean>> = {};
let armedReadLinkSaves: Partial<Record<ProviderKey, string>> = {};
let currentViewState: PopupViewState = "loading";
let currentErrorMessage = "Search failed.";
let currentProviderPage: ProviderPageContext | null = null;
let currentInactiveTitleMarkup = '<span class="brand-white">Manga</span> <span class="brand-red">Baka</span>';
const RETRY_COOLDOWN_SECONDS = 2;

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup();
});

async function initializePopup(): Promise<void> {
  setResetEnabled(false);
  setStatus("Checking the current tab...", "idle");
  currentInactiveTitleMarkup = await getAlternatingInactiveTitleMarkup();
  currentSettings = await loadSettings();
  applyPopupMaxHeight(currentSettings.popupMaxHeightPx);
  renderHeaderAccessoryState();
  getInfoVersionNode().textContent = EXTENSION_VERSION_NAME;
  wireOptionsControls();
  renderOptionsPanel();

  const activeTab = await getActiveTab();
  currentTabId = typeof activeTab?.id === "number" ? activeTab.id : null;
  currentSourceUrl = activeTab?.url ?? "";
  void syncActionIcon();

  const providerPageContext = await getProviderPageContext(currentSourceUrl);
  if (providerPageContext) {
    currentCache = null;
    currentProviderPage = providerPageContext;
    renderProviderPageState(providerPageContext);
    return;
  }

  currentProviderPage = null;
  if (!isMangabakaSeriesUrl(currentSourceUrl)) {
    currentCache = null;
    await renderUnsupportedState();
    return;
  }

  const seriesId = getSeriesIdFromUrl(currentSourceUrl);
  if (!seriesId) {
    currentCache = null;
    await renderUnsupportedState();
    return;
  }

  setResetEnabled(true);
  wireTopResetButton(seriesId);

  const cachedLookup = await loadCache(seriesId);
  if (cachedLookup) {
    currentCache = cachedLookup;
    renderLookup(cachedLookup, true);
    return;
  }

  await runLookup(currentSourceUrl, seriesId, createEmptyRejectedProviderUrls(), { ...EMPTY_TITLE_ATTEMPT_INDEXES });
}

async function getActiveTab(): Promise<{ id?: number; url?: string } | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
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
  const popupMaxHeightPx = normalizePopupMaxHeight(settings?.popupMaxHeightPx);
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
    popupMaxHeightPx,
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

  getInfoButton().onclick = (event) => {
    event.stopPropagation();
    setInfoPopoverOpen(getInfoPopover().hidden);
  };

  document.addEventListener("click", (event) => {
    if (!isOptionsPanelOpen() || getInfoPopover().hidden) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (getInfoButton().contains(target) || getInfoPopover().contains(target)) {
      return;
    }

    setInfoPopoverOpen(false);
  });

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

  const commitPopupMaxHeight = (): void => {
    const normalizedValue = normalizePopupMaxHeight(getPopupMaxHeightInput().value);
    getPopupMaxHeightInput().value = String(normalizedValue);
    if (normalizedValue === currentSettings.popupMaxHeightPx) {
      applyPopupMaxHeight(normalizedValue);
      renderPopupMaxHeightControls();
      return;
    }

    void updateSettings({
      ...currentSettings,
      popupMaxHeightPx: normalizedValue,
    });
  };

  getPopupMaxHeightInput().oninput = () => {
    const rawValue = getPopupMaxHeightInput().value.trim();
    if (!rawValue) {
      return;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    if (parsedValue < MIN_POPUP_MAX_HEIGHT_PX && rawValue.length >= String(MIN_POPUP_MAX_HEIGHT_PX).length) {
      commitPopupMaxHeight();
      return;
    }

    if (parsedValue >= MIN_POPUP_MAX_HEIGHT_PX && parsedValue !== currentSettings.popupMaxHeightPx) {
      void updateSettings({
        ...currentSettings,
        popupMaxHeightPx: normalizePopupMaxHeight(parsedValue),
      });
    }
  };
  getPopupMaxHeightInput().onchange = commitPopupMaxHeight;
  getPopupMaxHeightInput().onblur = commitPopupMaxHeight;
  getPopupMaxHeightResetButton().onclick = () => {
    getPopupMaxHeightInput().value = String(DEFAULT_POPUP_MAX_HEIGHT_PX);
    commitPopupMaxHeight();
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
  applyPopupMaxHeight(currentSettings.popupMaxHeightPx);
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
  renderPopupMaxHeightControls();
  getMangaBakaButtonTargetSelect().value = currentSettings.mangaBakaButtonTarget;
  getMangaBakaProfileNameInput().value = currentSettings.mangaBakaProfileName;
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

function normalizeLinkTargetType(value: string | undefined, fallback: LinkTargetType = DEFAULT_MANGABAKA_LINK_TARGET_TYPE): LinkTargetType {
  return value === "new" || value === "current" ? value : fallback;
}

function normalizePopupMaxHeight(value: number | string | undefined): number {
  const parsedValue = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_POPUP_MAX_HEIGHT_PX;
  }

  return Math.max(MIN_POPUP_MAX_HEIGHT_PX, Math.round(parsedValue));
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

function applyPopupMaxHeight(maxHeightPx: number): void {
  document.documentElement.style.setProperty("--popup-max-height", `${normalizePopupMaxHeight(maxHeightPx)}px`);
}

function renderPopupMaxHeightControls(): void {
  const input = getPopupMaxHeightInput();
  const resetButton = getPopupMaxHeightResetButton();
  input.min = String(MIN_POPUP_MAX_HEIGHT_PX);
  input.step = "1";
  input.value = String(currentSettings.popupMaxHeightPx);
  resetButton.disabled = currentSettings.popupMaxHeightPx === DEFAULT_POPUP_MAX_HEIGHT_PX;
}

function isOptionsPanelOpen(): boolean {
  return getOptionsPanel().dataset.open === "true";
}

function setOptionsPanelOpen(isOpen: boolean): void {
  const panel = getOptionsPanel();
  panel.dataset.open = isOpen ? "true" : "false";
  panel.hidden = false;
  if (isOpen) {
    clearPendingConfirmation();
  }
  renderHeaderAccessoryState();
}

function setInfoPopoverOpen(isOpen: boolean): void {
  const infoPopover = getInfoPopover();
  const infoButton = getInfoButton();
  infoPopover.hidden = !isOpen;
  infoButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderHeaderAccessoryState(): void {
  const optionsOpen = isOptionsPanelOpen();
  getResetButton().hidden = optionsOpen;
  getInfoButton().hidden = !optionsOpen;
  getOptionsButton().setAttribute("aria-expanded", optionsOpen ? "true" : "false");
  if (!optionsOpen) {
    setInfoPopoverOpen(false);
  }
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

  if (currentTabId == null) {
    throw new Error("No active tab available.");
  }

  await chrome.tabs.update(currentTabId, { url });
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
  const fetchedMetadata = await fetchProviderPageMetadata(providerKey, sourceUrl, pageType);
  if (fetchedMetadata?.titles.length) {
    return fetchedMetadata;
  }

  return extractProviderPageMetadataFromActiveTab(providerKey, sourceUrl);
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

async function fetchProviderDocument(sourceUrl: string): Promise<Document | null> {
  try {
    const response = await fetch(sourceUrl, { credentials: "include" });
    if (!response.ok) {
      return null;
    }

    return new DOMParser().parseFromString(await response.text(), "text/html");
  } catch {
    return null;
  }
}

function parseAtsumaruEmbeddedTitles(scriptText: string): string[] {
  const match = scriptText.match(/window\.mangaPage\s*=\s*(\{[\s\S]*?\});/);
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
      continue;
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

async function fetchAtsumaruProviderPageMetadata(
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  const documentNode = await fetchProviderDocument(getAtsumaruMetadataUrl(sourceUrl, pageType));
  if (!documentNode) {
    return null;
  }

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

async function fetchMangaFireProviderPageMetadata(sourceUrl: string): Promise<ExtractedMetadataPayload | null> {
  const documentNode = await fetchProviderDocument(sourceUrl);
  if (!documentNode) {
    return null;
  }

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

async function fetchWeebCentralProviderPageMetadata(
  sourceUrl: string,
  pageType: "series" | "chapter",
): Promise<ExtractedMetadataPayload | null> {
  const parsedUrl = new URL(sourceUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const slugTitle = pageType === "series" && segments[0] === "series" && segments[2]
    ? hyphenatedTitleToText(segments[2])
    : "";

  const documentNode = await fetchProviderDocument(sourceUrl);
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

async function extractProviderPageMetadataFromActiveTab(
  providerKey: ProviderKey,
  sourceUrl: string,
): Promise<ExtractedMetadataPayload | null> {
  if (currentTabId == null) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
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
              continue;
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
            const match = scriptText.match(/window\.mangaPage\s*=\s*(\{[\s\S]*?\});/);
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
              continue;
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
              continue;
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
  } catch {
    return null;
  }
}

function buildMangaBakaSearchUrl(title: string): string {
  return `https://mangabaka.org/search?q=${encodeURIComponent(title)}`;
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
}

async function clearCache(seriesId: string): Promise<void> {
  await chrome.storage.local.remove(getCacheKey(seriesId));
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
  if (currentTabId == null) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
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
            continue;
          }
        }

        const fallbackTitles = extractTitleCandidatesFromDocument();
        return fallbackTitles.length > 0 ? { titles: fallbackTitles, authors: [] } : null;
      },
    });

    const payload = results?.[0]?.result as ExtractedMetadataPayload | null | undefined;
    return payload && payload.titles.length > 0 ? payload : null;
  } catch {
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
      continue;
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
    const response = await fetch(`https://atsu.moe/api/search/page?query=${encodeURIComponent(title)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AtsuSearchResponse;
    for (const hit of payload.hits ?? []) {
      if (hit.type && hit.type.toLowerCase() !== "manga") {
        continue;
      }

      const url = `https://atsu.moe/manga/${hit.id}`;
      if (rejectedUrlSet.has(url)) {
        continue;
      }

      const score = scoreTitleMatch(hit.title, normalizedSourceTitles);
      if (score < 90) {
        continue;
      }

      const existingCandidate = candidates.get(hit.id);
      if (!existingCandidate || score > existingCandidate.score) {
        candidates.set(hit.id, { id: hit.id, title: hit.title, score });
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

  return {
    provider: "MangaDex",
    title: bestMatch.title,
    url: `https://mangadex.org/title/${bestMatch.id}/${slugifyTitle(bestMatch.title)}`,
    latestChapterNumber: await fetchMangaDexLatestEnglishChapterNumber(bestMatch.id),
    latestChapterLanguage: "en",
  };
}

async function fetchMangaDexLatestEnglishChapterNumber(mangaId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(mangaId)}/feed?translatedLanguage[]=en&order[publishAt]=desc&limit=25`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as MangaDexFeedResponse;
    for (const chapter of payload.data ?? []) {
      if (chapter.attributes?.translatedLanguage !== "en") {
        continue;
      }

      const chapterNumber = formatChapterNumber(chapter.attributes?.chapter ?? null);
      if (chapterNumber) {
        return chapterNumber;
      }
    }

    return null;
  } catch {
    return null;
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
      continue;
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
  return (
    (await searchViaYahoo(metadata, rejectedUrls, titleIndex, {
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
    })) ??
    searchViaBrave(metadata, rejectedUrls, titleIndex, {
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
    })
  );
}

async function searchWeebCentral(metadata: MangaBakaMetadata, rejectedUrls: string[], titleIndex: number): Promise<ProviderMatch | null> {
  return (
    (await searchViaYahoo(metadata, rejectedUrls, titleIndex, {
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
    })) ??
    searchViaBrave(metadata, rejectedUrls, titleIndex, {
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
    })
  );
}

async function searchViaBrave(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
  config: {
    provider: ProviderMatch["provider"];
    siteQuery: string;
    matchUrl: (url: URL) => boolean;
    canonicalizeUrl: (url: URL) => string | null;
    getCandidateTitles: (result: BraveSearchResult, url: URL) => string[];
    getDisplayTitle: (result: BraveSearchResult, url: URL) => string;
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
      `https://search.brave.com/search?q=${encodeURIComponent(`${config.siteQuery} ${title}`)}&source=web`,
      { headers: { accept: "text/html" } },
    );
    if (!response.ok) {
      return null;
    }

    html = await response.text();
  } catch {
    return null;
  }

  const searchResults = extractBraveSearchResults(html);
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

async function searchViaYahoo(
  metadata: MangaBakaMetadata,
  rejectedUrls: string[],
  titleIndex: number,
  config: {
    provider: ProviderMatch["provider"];
    siteQuery: string;
    matchUrl: (url: URL) => boolean;
    canonicalizeUrl: (url: URL) => string | null;
    getCandidateTitles: (result: BraveSearchResult, url: URL) => string[];
    getDisplayTitle: (result: BraveSearchResult, url: URL) => string;
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

function extractBraveSearchResults(html: string): BraveSearchResult[] {
  const seenUrls = new Set<string>();
  const results: BraveSearchResult[] = [];
  const pattern = /https?:\/\/[^\s"'<>]+/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const url = decodeHtmlText(match[0] ?? "").replace(/&amp;/g, "&");
    if (!url || !url.startsWith("http") || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    results.push({ url, title: "", cite: "" });
  }

  return results;
}

function extractYahooSearchResults(html: string): BraveSearchResult[] {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(documentNode.querySelectorAll<HTMLAnchorElement>('a[href^="https://r.search.yahoo.com/"]'));
  const seenUrls = new Set<string>();
  const results: BraveSearchResult[] = [];

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
    .replace(/^\s*(\[[^\]]+\]\s*)+/, "")
    .replace(/\s*(\[[^\]]+\]\s*)+$/, "")
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
  await chrome.storage.local.set({ [storageKey]: nextVariant });

  return nextVariant === "jp-first"
    ? '<span class="brand-white">マンガ</span> <span class="brand-red">Baka</span>'
    : '<span class="brand-white">Manga</span> <span class="brand-red">バカ</span>';
}

async function renderUnsupportedState(): Promise<void> {
  currentViewState = "unsupported";
  currentProviderPage = null;
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

  void fromCache;
  getSubtitleNode().textContent = cache.authors[0] ? `by ${cache.authors[0]}` : "";
  renderProviderRows(cache.results, {
    cache,
    emptyLabel: "No Match Found",
    enableProviderReset: true,
  });
  setStatus(fromCache ? "Loaded cached result" : "Search complete", "success");
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
    if (providerResult?.latestChapterNumber) {
      const latestLabel = `Ch. ${providerResult.latestChapterNumber.replace(/^page\.\s*/i, "")}`;
      meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>${escapeHtml(latestLabel)}</span>`;
    } else if (providerResult) {
      if (provider.key === "mangadex") {
        meta.innerHTML = `${ENGLISH_FLAG_ICON}<span>Purged 😔</span>`;
      } else if (provider.key === "mangafire" || provider.key === "weebcentral") {
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

    if (providerResult) {
      actions.append(copyButton, openButton, incorrectButton);
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

async function copyLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  await navigator.clipboard.writeText(url);
  armedReadLinkSaves = { [providerKey]: url };
  rerenderCurrentResultsOnly();
  setStatus(`${providerLabel} link copied`, "success");
}

async function saveReadLink(providerKey: ProviderKey, url: string, providerLabel: string): Promise<void> {
  if (currentTabId == null) {
    setStatus("No active MangaBaka tab available", "error");
    return;
  }

  setStatus(`Saving ${providerLabel} as Read Link...`, "loading");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
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

        let input: HTMLInputElement | HTMLTextAreaElement | null = null;
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
      throw new Error(result?.error ?? "Unable to save MangaBaka Read Link.");
    }

    delete armedReadLinkSaves[providerKey];
    rerenderCurrentResultsOnly();
    setStatus(`${providerLabel} saved as MangaBaka Read Link`, "success");
  } catch (error) {
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
  };
}

async function handleTopReset(seriesId: string): Promise<void> {
  setStatus("Clearing cached search...", "loading");
  await clearCache(seriesId);
  currentCache = null;

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
  if (pendingConfirmation?.button === button && document.activeElement === button) {
    const confirmedAction = pendingConfirmation.action;
    clearPendingConfirmation();
    void confirmedAction();
    return;
  }

  clearPendingConfirmation();
  button.classList.add("icon-button--confirm");
  button.focus();

  const timeoutId = window.setTimeout(() => {
    clearPendingConfirmation();
  }, 6000);

  pendingConfirmation = {
    button,
    message,
    action,
    timeoutId,
  };

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

  showConfirmPanel(message);
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
  pendingConfirmation.button.classList.remove("icon-button--confirm");
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

function getInfoButton(): HTMLButtonElement {
  return document.getElementById("info-button") as HTMLButtonElement;
}

function getInfoPopover(): HTMLElement {
  return document.getElementById("info-popover") as HTMLElement;
}

function getInfoVersionNode(): HTMLElement {
  return document.getElementById("info-version") as HTMLElement;
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

function getPopupMaxHeightInput(): HTMLInputElement {
  return document.getElementById("option-popup-max-height") as HTMLInputElement;
}

function getPopupMaxHeightResetButton(): HTMLButtonElement {
  return document.getElementById("option-popup-max-height-reset") as HTMLButtonElement;
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
