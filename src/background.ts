import { isMangaBakaPageUrl } from "./mangabaka/url";
import { runExtensionInstallMigrations } from "./background/install";
import { createReleaseUpdateController, RELEASE_UPDATE_ALARM_NAME } from "./release/update";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;
declare const __LOCAL_RELEASE_UPDATES_ENABLED__: boolean;

type BackgroundProviderKey = "atsu" | "mangadex" | "mangafire" | "weebcentral" | "ehentai" | "exhentai" | "comixto";

type BackgroundMessage =
  | { protocolVersion: 1; type: "action:sync"; tabId: number; url?: string }
  | { protocolVersion: 1; type: "release:ensure" };

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
const BACKGROUND_DEFAULT_ENABLED_PROVIDERS = {
  atsu: true,
  mangadex: true,
  comixto: false,
  mangafire: false,
  weebcentral: false,
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: false, exhentai: false } : {}),
} as Record<BackgroundProviderKey, boolean>;
const BACKGROUND_MANIFEST = chrome.runtime.getManifest();
const releaseUpdates = __LOCAL_RELEASE_UPDATES_ENABLED__
  ? createReleaseUpdateController({
      currentVersion: BACKGROUND_MANIFEST.version,
      versionName: BACKGROUND_MANIFEST.version_name ?? BACKGROUND_MANIFEST.version,
      storage: chrome.storage.local,
      alarms: chrome.alarms,
      tabs: chrome.tabs,
    })
  : null;

let activeIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;
let inactiveIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;
let enabledProvidersPromise: Promise<typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS> | null = null;
let nextActionUpdateGeneration = 0;

const actionUpdateGenerations = new Map<number, number>();
const appliedActionStates = new Map<number, boolean>();
const actionWriteQueues = new Map<number, Promise<void>>();

function runBackgroundTask(description: string, task: () => Promise<unknown>): void {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      console.warn(`Failed to ${description}.`, error);
    });
}

async function loadIconImageData(path: string, size: number): Promise<ImageData> {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) {
    throw new Error(`Failed to load icon asset: ${path}`);
  }

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create icon canvas context.");
    }

    context.clearRect(0, 0, size, size);
    context.drawImage(bitmap, 0, 0, size, size);
    return context.getImageData(0, 0, size, size);
  } finally {
    bitmap.close();
  }
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

function isMissingTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id|Tabs cannot be edited right now|tab was closed/i.test(error.message);
}

function getProviderKeyForUrl(url?: string): BackgroundProviderKey | null {
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
      default:
        if (__ADULT_PROVIDERS_ENABLED__) {
          if (parsedUrl.hostname === "e-hentai.org") {
            return "ehentai";
          }
          if (parsedUrl.hostname === "exhentai.org") {
            return "exhentai";
          }
        }
        return null;
    }
  } catch {
    return null;
  }
}

function loadEnabledProviders(): Promise<typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS> {
  if (enabledProvidersPromise) {
    return enabledProvidersPromise;
  }

  const loadPromise = chrome.storage.local.get(BACKGROUND_SETTINGS_KEY)
    .then((stored) => {
      const settings =
        stored[BACKGROUND_SETTINGS_KEY] as { enabledProviders?: Partial<typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS> } | undefined;
      return {
        ...BACKGROUND_DEFAULT_ENABLED_PROVIDERS,
        ...settings?.enabledProviders,
        comixto: false,
      };
    });
  const cachedPromise = loadPromise.catch((error) => {
      if (enabledProvidersPromise === cachedPromise) {
        enabledProvidersPromise = null;
      }
      throw error;
    });
  enabledProvidersPromise = cachedPromise;
  return cachedPromise;
}

function invalidateEnabledProviders(): void {
  enabledProvidersPromise = null;
}

function beginActionUpdate(tabId: number): number {
  const generation = ++nextActionUpdateGeneration;
  actionUpdateGenerations.set(tabId, generation);
  return generation;
}

function isCurrentActionUpdate(tabId: number, generation: number): boolean {
  return actionUpdateGenerations.get(tabId) === generation;
}

function forgetActionStateForTab(tabId: number): void {
  actionUpdateGenerations.delete(tabId);
  appliedActionStates.delete(tabId);
}

async function applyActionState(tabId: number, generation: number, isActive: boolean): Promise<void> {
  if (!isCurrentActionUpdate(tabId, generation) || appliedActionStates.get(tabId) === isActive) {
    return;
  }

  const imageData = await getActionIconImageData(isActive);
  if (!isCurrentActionUpdate(tabId, generation) || appliedActionStates.get(tabId) === isActive) {
    return;
  }

  const previousWrite = actionWriteQueues.get(tabId) ?? Promise.resolve();
  const write = previousWrite.catch(() => undefined).then(async () => {
    if (!isCurrentActionUpdate(tabId, generation) || appliedActionStates.get(tabId) === isActive) {
      return;
    }

    let iconApplied = false;
    try {
      await chrome.action.setIcon({ tabId, imageData });
      iconApplied = true;
    } catch (error) {
      if (isMissingTabError(error)) {
        if (isCurrentActionUpdate(tabId, generation)) {
          forgetActionStateForTab(tabId);
        }
        return;
      }

      console.warn("Failed to update the action icon from image data. Falling back to asset paths.", error);
      if (!isCurrentActionUpdate(tabId, generation)) {
        return;
      }

      try {
        await chrome.action.setIcon({
          tabId,
          path: isActive ? ACTIVE_ICON_ASSET_PATHS : INACTIVE_ICON_ASSET_PATHS,
        });
        iconApplied = true;
      } catch (fallbackError) {
        if (isMissingTabError(fallbackError)) {
          if (isCurrentActionUpdate(tabId, generation)) {
            forgetActionStateForTab(tabId);
          }
          return;
        }

        console.warn("Failed to update the action icon from asset paths.", fallbackError);
      }
    }

    if (!isCurrentActionUpdate(tabId, generation)) {
      return;
    }

    let titleApplied = false;
    try {
      await chrome.action.setTitle({
        tabId,
        title: isActive ? "MangaBaka URL Finder" : "MangaBaka URL Finder (inactive on this page)",
      });
      titleApplied = true;
    } catch (error) {
      if (isMissingTabError(error)) {
        if (isCurrentActionUpdate(tabId, generation)) {
          forgetActionStateForTab(tabId);
        }
        return;
      }

      console.warn("Failed to update the action title.", error);
    }

    if (iconApplied && titleApplied && isCurrentActionUpdate(tabId, generation)) {
      appliedActionStates.set(tabId, isActive);
    }
  });

  actionWriteQueues.set(tabId, write);
  try {
    await write;
  } finally {
    if (actionWriteQueues.get(tabId) === write) {
      actionWriteQueues.delete(tabId);
    }
  }
}

async function updateActionForTabAtGeneration(
  tabId: number,
  url: string | undefined,
  generation: number,
  enabledProviders?: typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS,
): Promise<void> {
  const providers = enabledProviders ?? await loadEnabledProviders();
  if (!isCurrentActionUpdate(tabId, generation)) {
    return;
  }

  const providerKey = getProviderKeyForUrl(url);
  const isActive = Boolean(url && isMangaBakaPageUrl(url)) || (providerKey != null && providers[providerKey]);
  await applyActionState(tabId, generation, isActive);
}

function updateActionForTab(
  tabId: number,
  url: string | undefined,
  enabledProviders?: typeof BACKGROUND_DEFAULT_ENABLED_PROVIDERS,
): Promise<void> {
  return updateActionForTabAtGeneration(tabId, url, beginActionUpdate(tabId), enabledProviders);
}

async function updateActionForCurrentTab(tabId: number): Promise<void> {
  const generation = beginActionUpdate(tabId);
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateActionForTabAtGeneration(tabId, tab.url, generation);
  } catch (error) {
    if (!isMissingTabError(error)) {
      throw error;
    }

    if (isCurrentActionUpdate(tabId, generation)) {
      forgetActionStateForTab(tabId);
    }
  }
}

async function refreshAllTabs(): Promise<void> {
  const enabledProviders = await loadEnabledProviders();
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab: { id?: number }) => typeof tab.id === "number")
      .map((tab: { id?: number; url?: string }) => updateActionForTab(tab.id as number, tab.url, enabledProviders)),
  );
}

// noinspection JSDeprecatedSymbols
chrome.runtime.onInstalled.addListener((details) => {
  runBackgroundTask("refresh action states after extension installation", refreshAllTabs);
  if (releaseUpdates) {
    runBackgroundTask("sync the release-update schedule after extension installation", () => releaseUpdates.syncSchedule());
  }
  runBackgroundTask(
    "migrate lookup cache storage during extension update",
    () => runExtensionInstallMigrations(details.reason, chrome.storage.local),
  );
});

// noinspection JSDeprecatedSymbols
chrome.runtime.onStartup.addListener(() => {
  runBackgroundTask("refresh action states during browser startup", refreshAllTabs);
  if (releaseUpdates) {
    runBackgroundTask("sync the release-update schedule during browser startup", () => releaseUpdates.syncSchedule());
  }
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onActivated.addListener(({ tabId }: { tabId: number }) => {
  runBackgroundTask("refresh the activated tab action state", () => updateActionForCurrentTab(tabId));
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string; status?: string }, tab: { url?: string }) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    runBackgroundTask("refresh an updated tab action state", () => updateActionForTab(tabId, changeInfo.url ?? tab.url));
  }
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onRemoved.addListener((tabId: number) => {
  forgetActionStateForTab(tabId);
});

// noinspection JSDeprecatedSymbols
chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
  if (areaName === "local" && BACKGROUND_SETTINGS_KEY in changes) {
    invalidateEnabledProviders();
    runBackgroundTask("refresh action states after a settings change", refreshAllTabs);
  }
});

if (__LOCAL_RELEASE_UPDATES_ENABLED__ && releaseUpdates) {
  // noinspection JSDeprecatedSymbols
  chrome.alarms.onAlarm.addListener((alarm: { name?: string }) => {
    if (alarm.name === RELEASE_UPDATE_ALARM_NAME) {
      runBackgroundTask("sync the scheduled release-update check", () => releaseUpdates.syncSchedule(true));
    }
  });
}

// noinspection JSDeprecatedSymbols
chrome.runtime.onMessage.addListener((rawMessage: unknown) => {
  if (!rawMessage || typeof rawMessage !== "object") {
    return;
  }

  const message = rawMessage as Partial<BackgroundMessage>;
  if (message.protocolVersion !== 1) {
    return;
  }

  if (message.type === "action:sync" && typeof message.tabId === "number") {
    runBackgroundTask("refresh the requested tab action state", () => updateActionForCurrentTab(message.tabId as number));
    return;
  }

  if (message.type === "release:ensure" && releaseUpdates) {
    runBackgroundTask("ensure the release-update status", () => releaseUpdates.ensureStatus());
  }
});
