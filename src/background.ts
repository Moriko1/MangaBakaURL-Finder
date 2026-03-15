const ACTIVE_ICON_PATHS = {
  16: chrome.runtime.getURL("assets/icon-color-16.png"),
  32: chrome.runtime.getURL("assets/icon-color-32.png"),
  48: chrome.runtime.getURL("assets/icon-color-48.png"),
  128: chrome.runtime.getURL("assets/icon-color-128.png"),
};

const INACTIVE_ICON_PATHS = {
  16: chrome.runtime.getURL("assets/icon-gray-16.png"),
  32: chrome.runtime.getURL("assets/icon-gray-32.png"),
  48: chrome.runtime.getURL("assets/icon-gray-48.png"),
  128: chrome.runtime.getURL("assets/icon-gray-128.png"),
};

const BACKGROUND_SETTINGS_KEY = "extension:settings";
const BACKGROUND_DEFAULT_ENABLED_PROVIDERS = {
  atsu: true,
  mangadex: true,
  ehentai: false,
  exhentai: false,
  comixto: false,
  mangafire: false,
  weebcentral: false,
};

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
  const isActive = isMangabakaUrl(url) || (providerKey != null && enabledProviders[providerKey] === true);
  try {
    await chrome.action.setIcon({
      tabId,
      path: isActive ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS,
    });

    await chrome.action.setTitle({
      tabId,
      title: isActive ? "MangaBaka URL Finder" : "MangaBaka URL Finder (inactive on this page)",
    });
  } catch (error) {
    if (!isMissingTabError(error)) {
      throw error;
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

chrome.runtime.onInstalled.addListener(() => {
  void refreshAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshAllTabs();
});

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

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string; status?: string }, tab: { url?: string }) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void updateActionForTab(tabId, changeInfo.url ?? tab.url);
  }
});

chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
  if (areaName === "local" && BACKGROUND_SETTINGS_KEY in changes) {
    void refreshAllTabs();
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string; tabId?: number; url?: string }) => {
  if (message.type === "sync-action-icon" && typeof message.tabId === "number") {
    void updateActionForTab(message.tabId, message.url);
  }
});
