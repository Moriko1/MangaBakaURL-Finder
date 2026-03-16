// noinspection JSUnusedGlobalSymbols
const ACTIVE_ICON_ASSET_PATHS: Record<string, string> = {
  "16": "assets/icon-color-16.png",
  "32": "assets/icon-color-32.png",
  "48": "assets/icon-color-48.png",
  "128": "assets/icon-color-128.png",
};

const INACTIVE_ICON_ASSET_PATHS: Record<string, string> = {
  "16": "assets/icon-gray-16.png",
  "32": "assets/icon-gray-32.png",
  "48": "assets/icon-gray-48.png",
  "128": "assets/icon-gray-128.png",
};

const BACKGROUND_SETTINGS_KEY = "extension:settings";
const RELEASE_UPDATE_STORAGE_KEY = "extension:release-update";
const RELEASE_UPDATE_ATTEMPT_KEY = "extension:release-update-attempt";
const RELEASE_UPDATE_ALARM_NAME = "extension:release-update-check";
const GITHUB_RELEASES_LATEST_PAGE_URL = "https://github.com/Moriko1/MangaBakaURL-Finder/releases/latest";
const GITHUB_RELEASES_LATEST_API_URL = "https://api.github.com/repos/Moriko1/MangaBakaURL-Finder/releases/latest";
const BACKGROUND_DEFAULT_ENABLED_PROVIDERS = {
  atsu: true,
  mangadex: true,
  ehentai: false,
  exhentai: false,
  comixto: false,
  mangafire: false,
  weebcentral: false,
};
const BACKGROUND_MANIFEST = chrome.runtime.getManifest();
const BACKGROUND_EXTENSION_VERSION = BACKGROUND_MANIFEST.version;
const BACKGROUND_EXTENSION_VERSION_NAME = BACKGROUND_MANIFEST.version_name ?? BACKGROUND_MANIFEST.version;

interface ReleaseUpdateRecord {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTagName: string | null;
  latestReleaseUrl: string;
  status: "up_to_date" | "update_available";
}

interface GitHubLatestReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

interface LatestReleaseResolution {
  latestTagName: string | null;
  latestReleaseUrl: string;
}

interface ReleaseUpdateAttemptRecord {
  attemptedAt: string;
  currentVersion: string;
}

let activeIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;
let inactiveIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;
let releaseUpdateSyncPromise: Promise<void> | null = null;
let pendingForcedReleaseUpdateSync = false;

async function loadIconImageData(path: string, size: number): Promise<ImageData> {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) {
    throw new Error(`Failed to load icon asset: ${path}`);
  }

  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create icon canvas context.");
  }

  context.clearRect(0, 0, size, size);
  context.drawImage(bitmap, 0, 0, size, size);
  return context.getImageData(0, 0, size, size);
}

async function loadIconSet(assetPaths: Record<string, string>): Promise<Record<number, ImageData>> {
  const iconEntries = await Promise.all(
    Object.entries(assetPaths).map(async ([size, path]) => [Number(size), await loadIconImageData(path, Number(size))] as const),
  );
  return Object.fromEntries(iconEntries) as Record<number, ImageData>;
}

function getActionIconImageData(isActive: boolean): Promise<Record<number, ImageData>> {
  if (isActive) {
    activeIconImageDataPromise ??= loadIconSet(ACTIVE_ICON_ASSET_PATHS).catch((error) => {
      activeIconImageDataPromise = null;
      throw error;
    });
    return activeIconImageDataPromise;
  }

  inactiveIconImageDataPromise ??= loadIconSet(INACTIVE_ICON_ASSET_PATHS).catch((error) => {
    inactiveIconImageDataPromise = null;
    throw error;
  });
  return inactiveIconImageDataPromise;
}

function isMangabakaUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    return new URL(url).hostname === "mangabaka.org";
  } catch {
    return false;
  }
}

function isMissingTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id|Tabs cannot be edited right now|tab was closed/i.test(error.message);
}

function isLocalInstallSource(): boolean {
  return !/\((Google|Firefox)\)$/i.test(BACKGROUND_EXTENSION_VERSION_NAME);
}

function normalizeVersion(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^v?(\d+(?:\.\d+)*)/i);
  return match?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function extractReleaseTagFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const tagIndex = segments.findIndex((segment) => segment === "tag");
    return tagIndex >= 0 && segments[tagIndex + 1] ? decodeURIComponent(segments[tagIndex + 1]) : null;
  } catch {
    return null;
  }
}

function getLastScheduledReleaseUpdateTime(reference = new Date()): number {
  const scheduledTime = new Date(reference);
  scheduledTime.setHours(2, 0, 0, 0);
  if (reference.getTime() < scheduledTime.getTime()) {
    scheduledTime.setDate(scheduledTime.getDate() - 1);
  }
  return scheduledTime.getTime();
}

function getNextScheduledReleaseUpdateTime(reference = new Date()): number {
  const scheduledTime = new Date(reference);
  scheduledTime.setHours(2, 0, 0, 0);
  if (reference.getTime() >= scheduledTime.getTime()) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  return scheduledTime.getTime();
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isReleaseUpdateRecord(value: unknown): value is ReleaseUpdateRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.checkedAt === "string"
    && typeof record.currentVersion === "string"
    && typeof record.latestReleaseUrl === "string"
    && isNullableString(record.latestVersion)
    && isNullableString(record.latestTagName)
    && (record.status === "up_to_date" || record.status === "update_available")
  );
}

function isReleaseUpdateAttemptRecord(value: unknown): value is ReleaseUpdateAttemptRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.attemptedAt === "string" && typeof record.currentVersion === "string";
}

async function closeReleaseCheckTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    if (!isMissingTabError(error)) {
      console.warn("Failed to close the latest-release check tab.", error);
    }
  }
}

async function loadReleaseUpdateRecord(): Promise<ReleaseUpdateRecord | null> {
  const stored = await chrome.storage.local.get(RELEASE_UPDATE_STORAGE_KEY);
  return isReleaseUpdateRecord(stored[RELEASE_UPDATE_STORAGE_KEY]) ? stored[RELEASE_UPDATE_STORAGE_KEY] : null;
}

async function loadReleaseUpdateAttemptRecord(): Promise<ReleaseUpdateAttemptRecord | null> {
  const stored = await chrome.storage.local.get(RELEASE_UPDATE_ATTEMPT_KEY);
  return isReleaseUpdateAttemptRecord(stored[RELEASE_UPDATE_ATTEMPT_KEY]) ? stored[RELEASE_UPDATE_ATTEMPT_KEY] : null;
}

async function saveReleaseUpdateAttemptRecord(attemptedAt: string, currentVersion: string): Promise<void> {
  await chrome.storage.local.set({
    [RELEASE_UPDATE_ATTEMPT_KEY]: {
      attemptedAt,
      currentVersion,
    } satisfies ReleaseUpdateAttemptRecord,
  });
}

async function clearReleaseUpdateState(): Promise<void> {
  await chrome.alarms.clear(RELEASE_UPDATE_ALARM_NAME);
  await chrome.storage.local.remove([RELEASE_UPDATE_STORAGE_KEY, RELEASE_UPDATE_ATTEMPT_KEY]);
}

async function scheduleNextReleaseUpdateCheck(): Promise<void> {
  if (!isLocalInstallSource()) {
    await chrome.alarms.clear(RELEASE_UPDATE_ALARM_NAME);
    return;
  }

  await chrome.alarms.create(RELEASE_UPDATE_ALARM_NAME, {
    when: getNextScheduledReleaseUpdateTime(),
  });
}

async function shouldCheckLatestRelease(): Promise<boolean> {
  const currentVersion = normalizeVersion(BACKGROUND_EXTENSION_VERSION) ?? BACKGROUND_EXTENSION_VERSION;
  const record = await loadReleaseUpdateRecord();
  if (record && record.currentVersion === currentVersion) {
    const checkedAt = Date.parse(record.checkedAt);
    if (Number.isFinite(checkedAt)) {
      return checkedAt < getLastScheduledReleaseUpdateTime();
    }
  }

  const attemptRecord = await loadReleaseUpdateAttemptRecord();
  if (!attemptRecord || attemptRecord.currentVersion !== currentVersion) {
    return true;
  }

  const attemptedAt = Date.parse(attemptRecord.attemptedAt);
  if (!Number.isFinite(attemptedAt)) {
    return true;
  }

  return attemptedAt < getLastScheduledReleaseUpdateTime();
}

async function fetchLatestReleaseFromApi(): Promise<LatestReleaseResolution> {
  const response = await fetch(GITHUB_RELEASES_LATEST_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub latest release request failed with status ${response.status}.`);
  }

  const payload = await response.json() as GitHubLatestReleaseResponse;
  return {
    latestTagName: typeof payload.tag_name === "string" && payload.tag_name.trim() ? payload.tag_name.trim() : null,
    latestReleaseUrl: typeof payload.html_url === "string" && payload.html_url.trim()
      ? payload.html_url.trim()
      : GITHUB_RELEASES_LATEST_PAGE_URL,
  };
}

async function waitForTabToFinishLoading(tabId: number, timeoutMs = 15000): Promise<{ url?: string; status?: string }> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while resolving the latest GitHub release URL."));
    }, timeoutMs);

    // noinspection JSDeprecatedSymbols
    const cleanup = (): void => {
      globalThis.clearTimeout(timeoutId);
      // noinspection JSDeprecatedSymbols
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      // noinspection JSDeprecatedSymbols
      chrome.tabs.onRemoved.removeListener(handleRemoved);
    };

    const handleUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      void resolveCurrentTab();
    };

    const handleRemoved = (removedTabId: number): void => {
      if (removedTabId !== tabId) {
        return;
      }

      cleanup();
      reject(new Error("The latest-release check tab was closed before it finished loading."));
    };

    const resolveCurrentTab = async (): Promise<void> => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status !== "complete") {
          return;
        }

        cleanup();
        resolve(tab);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    // noinspection JSDeprecatedSymbols
    chrome.tabs.onUpdated.addListener(handleUpdated);
    // noinspection JSDeprecatedSymbols
    chrome.tabs.onRemoved.addListener(handleRemoved);
    void resolveCurrentTab();
  });
}

async function resolveLatestReleaseViaTab(): Promise<LatestReleaseResolution> {
  const existingTabs = await chrome.tabs.query({});
  const hostTab = existingTabs.find((tab: { windowId?: number }) => typeof tab.windowId === "number");
  if (!hostTab || typeof hostTab.windowId !== "number") {
    throw new Error("No browser window is available to resolve the latest GitHub release.");
  }

  const releaseTab = await chrome.tabs.create({
    url: GITHUB_RELEASES_LATEST_PAGE_URL,
    active: false,
    windowId: hostTab.windowId,
  });
  const releaseTabId = typeof releaseTab.id === "number" ? releaseTab.id : null;
  if (releaseTabId == null) {
    throw new Error("Unable to create the latest-release check tab.");
  }

  try {
    const resolvedTab = await waitForTabToFinishLoading(releaseTabId);
    const latestReleaseUrl = resolvedTab.url ?? GITHUB_RELEASES_LATEST_PAGE_URL;
    const latestTagName = extractReleaseTagFromUrl(latestReleaseUrl);
    if (!latestTagName) {
      throw new Error(`GitHub did not resolve the latest release to a tag URL: ${latestReleaseUrl}`);
    }

    return { latestTagName, latestReleaseUrl };
  } finally {
    await closeReleaseCheckTab(releaseTabId);
  }
}

async function fetchAndStoreLatestReleaseUpdate(checkedAt: string): Promise<void> {
  let latestRelease: LatestReleaseResolution;
  try {
    latestRelease = await fetchLatestReleaseFromApi();
    if (!latestRelease.latestTagName) {
      latestRelease = await resolveLatestReleaseViaTab();
    }
  } catch {
    latestRelease = await resolveLatestReleaseViaTab();
  }

  const latestTagName = latestRelease.latestTagName;
  const latestReleaseUrl = latestRelease.latestReleaseUrl;
  const currentVersion = normalizeVersion(BACKGROUND_EXTENSION_VERSION) ?? BACKGROUND_EXTENSION_VERSION;
  const latestVersion = normalizeVersion(latestTagName);
  const hasUpdate = latestVersion != null && compareVersions(currentVersion, latestVersion) < 0;

  const record: ReleaseUpdateRecord = {
    checkedAt,
    currentVersion,
    latestVersion,
    latestTagName,
    latestReleaseUrl,
    status: hasUpdate ? "update_available" : "up_to_date",
  };

  await chrome.storage.local.set({
    [RELEASE_UPDATE_STORAGE_KEY]: record,
  });
}

async function syncReleaseUpdateSchedule(forceCheck = false): Promise<void> {
  pendingForcedReleaseUpdateSync = pendingForcedReleaseUpdateSync || forceCheck;
  if (releaseUpdateSyncPromise) {
    return releaseUpdateSyncPromise;
  }

  releaseUpdateSyncPromise = (async () => {
    do {
      const runForceCheck = pendingForcedReleaseUpdateSync;
      pendingForcedReleaseUpdateSync = false;

      if (!isLocalInstallSource()) {
        await clearReleaseUpdateState();
        return;
      }

      await scheduleNextReleaseUpdateCheck();
      if (runForceCheck || (await shouldCheckLatestRelease())) {
        const currentVersion = normalizeVersion(BACKGROUND_EXTENSION_VERSION) ?? BACKGROUND_EXTENSION_VERSION;
        const attemptedAt = new Date().toISOString();
        await saveReleaseUpdateAttemptRecord(attemptedAt, currentVersion);
        try {
          await fetchAndStoreLatestReleaseUpdate(attemptedAt);
        } catch (error) {
          console.warn("Failed to check the latest GitHub release.", error);
        }
      }

      await scheduleNextReleaseUpdateCheck();
    } while (pendingForcedReleaseUpdateSync);
  })().finally(() => {
    releaseUpdateSyncPromise = null;
  });

  return releaseUpdateSyncPromise;
}

function getProviderKeyForUrl(url?: string): keyof typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    switch (parsedUrl.hostname) {
      case "atsu.moe":
        return "atsu";
      case "mangadex.org":
        return "mangadex";
      case "mangafire.to":
        return "mangafire";
      case "weebcentral.com":
        return "weebcentral";
      case "e-hentai.org":
        return "ehentai";
      case "exhentai.org":
        return "exhentai";
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function loadEnabledProviders(): Promise<typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS> {
  const stored = await chrome.storage.local.get(BACKGROUND_SETTINGS_KEY);
  const settings =
    stored[BACKGROUND_SETTINGS_KEY] as { enabledProviders?: Partial<typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS> } | undefined;
  return {
    ...BACKGROUND_DEFAULT_ENABLED_PROVIDERS,
    ...settings?.enabledProviders,
    comixto: false,
  };
}

async function updateActionForTab(tabId: number, url?: string): Promise<void> {
  const enabledProviders = await loadEnabledProviders();
  const providerKey = getProviderKeyForUrl(url);
  const isActive = isMangabakaUrl(url) || (providerKey != null && enabledProviders[providerKey]);
  try {
    await chrome.action.setIcon({
      tabId,
      imageData: await getActionIconImageData(isActive),
    });
  } catch (error) {
    if (isMissingTabError(error)) {
      return;
    }

    console.warn("Failed to update the action icon from image data. Falling back to asset paths.", error);
    try {
      await chrome.action.setIcon({
        tabId,
        path: isActive ? ACTIVE_ICON_ASSET_PATHS : INACTIVE_ICON_ASSET_PATHS,
      });
    } catch (fallbackError) {
      if (isMissingTabError(fallbackError)) {
        return;
      }

      console.warn("Failed to update the action icon from asset paths.", fallbackError);
    }
  }

  try {
    await chrome.action.setTitle({
      tabId,
      title: isActive ? "MangaBaka URL Finder" : "MangaBaka URL Finder (inactive on this page)",
    });
  } catch (error) {
    if (!isMissingTabError(error)) {
      console.warn("Failed to update the action title.", error);
    }
  }
}

async function refreshAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab: { id?: number }) => typeof tab.id === "number")
      .map((tab: { id?: number; url?: string }) => updateActionForTab(tab.id as number, tab.url)),
  );
}

void refreshAllTabs();

// noinspection JSDeprecatedSymbols
chrome.runtime.onInstalled.addListener(() => {
  void refreshAllTabs();
  void syncReleaseUpdateSchedule();
});

// noinspection JSDeprecatedSymbols
chrome.runtime.onStartup.addListener(() => {
  void refreshAllTabs();
  void syncReleaseUpdateSchedule();
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onActivated.addListener(async ({ tabId }: { tabId: number }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateActionForTab(tabId, tab.url);
  } catch (error) {
    if (!isMissingTabError(error)) {
      throw error;
    }
  }
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string; status?: string }, tab: { url?: string }) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void updateActionForTab(tabId, changeInfo.url ?? tab.url);
  }
});

// noinspection JSDeprecatedSymbols
chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
  if (areaName === "local" && BACKGROUND_SETTINGS_KEY in changes) {
    void refreshAllTabs();
  }
});

// noinspection JSDeprecatedSymbols
chrome.alarms.onAlarm.addListener((alarm: { name?: string }) => {
  if (alarm.name === RELEASE_UPDATE_ALARM_NAME) {
    void syncReleaseUpdateSchedule(true);
  }
});

// noinspection JSDeprecatedSymbols
chrome.runtime.onMessage.addListener((message: { type?: string; tabId?: number; url?: string }) => {
  if (message.type === "sync-action-icon" && typeof message.tabId === "number") {
    void updateActionForTab(message.tabId, message.url);
    return;
  }

  if (message.type === "ensure-release-update-status") {
    void syncReleaseUpdateSchedule();
  }
});
