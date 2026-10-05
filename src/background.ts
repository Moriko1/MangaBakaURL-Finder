import { isActionActiveForUrl } from "./background/action-state";
import { runExtensionInstallMigrations } from "./background/install";
import { createContextMenuController } from "./background/context-menu";
import { createReleaseUpdateController, RELEASE_UPDATE_ALARM_NAME } from "./release/update";
import { loadSettings, SETTINGS_KEY } from "./settings";

declare const __LOCAL_RELEASE_UPDATES_ENABLED__: boolean;

type BackgroundMessage =
  | { protocolVersion: 1; type: "action:sync"; tabId?: number; url?: string }
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

let activeIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;
let inactiveIconImageDataPromise: Promise<Record<number, ImageData>> | null = null;

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

const contextMenusApi = chrome.contextMenus as typeof chrome.contextMenus | undefined;
const contextMenuController = contextMenusApi
  ? createContextMenuController({
      contextMenus: contextMenusApi,
      tabs: chrome.tabs,
      loadSettings: () => loadSettings(chrome.storage.local),
      getLastErrorMessage: () => chrome.runtime.lastError?.message ?? null,
    })
  : null;

let nextActionUpdateGeneration = 0;
let nextActionRefreshSweepGeneration = 0;
let currentActionRefreshSweepGeneration = 0;

const actionUpdateGenerations = new Map<number, number>();
const appliedActionStates = new Map<number, boolean>();
const actionWriteQueues = new Map<number, Promise<void>>();
const TRANSIENT_TAB_RETRY_DELAY_MS = 50;

function runBackgroundTask(description: string, task: () => Promise<unknown>): void {
  try {
    void task().catch((error) => {
      console.warn(`Failed to ${description}.`, error);
    });
  } catch (error) {
    console.warn(`Failed to ${description}.`, error);
  }
}

async function loadIconImageData(path: string, size: number): Promise<ImageData> {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) {
    throw new Error(`Failed to load action icon asset: ${path}`);
  }

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create the action icon canvas context.");
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
    Object.entries(assetPaths).map(async ([size, path]) => [
      Number(size),
      await loadIconImageData(path, Number(size)),
    ] as const),
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
}

function isMissingTabError(error: unknown): boolean {
  return /No tab with id|Invalid tab ID|tab was closed/i.test(getErrorMessage(error));
}

function isTransientTabEditError(error: unknown): boolean {
  return /Tabs cannot be edited right now/i.test(getErrorMessage(error));
}

type TabOperationResult<T> =
  | { status: "completed"; value: T }
  | { status: "stale" };

async function runTabOperationWithRetry<T>(
  tabId: number,
  generation: number,
  operation: () => Promise<T>,
): Promise<TabOperationResult<T>> {
  try {
    return { status: "completed", value: await operation() };
  } catch (error) {
    if (!isTransientTabEditError(error)) {
      throw error;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, TRANSIENT_TAB_RETRY_DELAY_MS));
    if (!isCurrentActionUpdate(tabId, generation)) {
      return { status: "stale" };
    }
    return { status: "completed", value: await operation() };
  }
}

function beginActionUpdate(tabId: number, force = false): number {
  const generation = ++nextActionUpdateGeneration;
  actionUpdateGenerations.set(tabId, generation);
  if (force) {
    // Lifecycle events deliberately reapply an equal logical state so a
    // missed earlier event or extension reload cannot leave a stale icon.
    appliedActionStates.delete(tabId);
  }
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

  const previousWrite = actionWriteQueues.get(tabId) ?? Promise.resolve();
  const write = previousWrite.catch(() => undefined).then(async () => {
    if (!isCurrentActionUpdate(tabId, generation) || appliedActionStates.get(tabId) === isActive) {
      return;
    }

    let iconApplied = false;
    if (typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") {
      try {
        const imageData = await getActionIconImageData(isActive);
        if (!isCurrentActionUpdate(tabId, generation)) {
          return;
        }

        const iconResult = await runTabOperationWithRetry(
          tabId,
          generation,
          () => chrome.action.setIcon({ tabId, imageData }),
        );
        if (iconResult.status === "stale") {
          return;
        }
        iconApplied = true;
      } catch (error) {
        if (isMissingTabError(error)) {
          if (isCurrentActionUpdate(tabId, generation)) {
            forgetActionStateForTab(tabId);
          }
          return;
        }

        console.warn("Failed to update the action icon from image data. Falling back to asset paths.", error);
      }
    }

    if (!iconApplied && isCurrentActionUpdate(tabId, generation)) {
      try {
        const iconResult = await runTabOperationWithRetry(
          tabId,
          generation,
          () => chrome.action.setIcon({
            tabId,
            path: isActive ? ACTIVE_ICON_ASSET_PATHS : INACTIVE_ICON_ASSET_PATHS,
          }),
        );
        if (iconResult.status === "stale") {
          return;
        }
        iconApplied = true;
      } catch (error) {
        if (isMissingTabError(error)) {
          if (isCurrentActionUpdate(tabId, generation)) {
            forgetActionStateForTab(tabId);
          }
          return;
        }

        console.warn("Failed to update the action icon from asset paths.", error);
      }
    }

    if (!isCurrentActionUpdate(tabId, generation)) {
      return;
    }

    let titleApplied = false;
    try {
      const titleResult = await runTabOperationWithRetry(
        tabId,
        generation,
        () => chrome.action.setTitle({
          tabId,
          title: isActive ? "MangaBaka URL Finder" : "MangaBaka URL Finder (inactive on this page)",
        }),
      );
      if (titleResult.status === "stale") {
        return;
      }
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
): Promise<void> {
  if (!isCurrentActionUpdate(tabId, generation)) {
    return;
  }

  const isActive = isActionActiveForUrl(url);
  await applyActionState(tabId, generation, isActive);
}

async function updateActionForCurrentTabAtGeneration(
  tabId: number,
  generation: number,
): Promise<void> {
  try {
    const tabResult = await runTabOperationWithRetry(tabId, generation, () => chrome.tabs.get(tabId));
    if (tabResult.status === "stale") {
      return;
    }
    await updateActionForTabAtGeneration(tabId, tabResult.value.pendingUrl ?? tabResult.value.url, generation);
  } catch (error) {
    if (!isMissingTabError(error)) {
      throw error;
    }

    if (isCurrentActionUpdate(tabId, generation)) {
      forgetActionStateForTab(tabId);
    }
  }
}

function updateActionForCurrentTab(
  tabId: number,
  force = false,
): Promise<void> {
  return updateActionForCurrentTabAtGeneration(
    tabId,
    beginActionUpdate(tabId, force),
  );
}

async function refreshAllTabs(): Promise<void> {
  const sweepGeneration = ++nextActionRefreshSweepGeneration;
  currentActionRefreshSweepGeneration = sweepGeneration;
  const tabs = await chrome.tabs.query({});
  if (currentActionRefreshSweepGeneration !== sweepGeneration) {
    return;
  }
  await Promise.all(
    tabs
      .filter((tab: { id?: number }) => typeof tab.id === "number")
      .map((tab: { id?: number }) => updateActionForCurrentTab(tab.id as number, true)),
  );
}

// noinspection JSDeprecatedSymbols
chrome.runtime.onInstalled.addListener((details) => {
  runBackgroundTask("refresh action states after extension installation", refreshAllTabs);
  if (contextMenuController) {
    runBackgroundTask("synchronize context menus after extension installation", () => contextMenuController.sync());
  }
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
  if (contextMenuController) {
    runBackgroundTask("synchronize context menus during browser startup", () => contextMenuController.sync());
  }
  if (releaseUpdates) {
    runBackgroundTask("sync the release-update schedule during browser startup", () => releaseUpdates.syncSchedule());
  }
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onActivated.addListener(({ tabId }: { tabId: number }) => {
  const generation = beginActionUpdate(tabId, true);
  runBackgroundTask(
    "refresh the activated tab action state",
    () => updateActionForCurrentTabAtGeneration(tabId, generation),
  );
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onUpdated.addListener((
  tabId: number,
  changeInfo: { url?: string; status?: string },
  tab: { pendingUrl?: string; url?: string },
) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    const generation = beginActionUpdate(tabId, true);
    runBackgroundTask(
      "refresh an updated tab action state",
      () => updateActionForTabAtGeneration(
        tabId,
        changeInfo.url ?? tab.pendingUrl ?? tab.url,
        generation,
      ),
    );
    return;
  }

  if (changeInfo.status === "loading") {
    // Chrome can reset tab-specific action properties during navigation. Do
    // not leave the tab without a replacement state while waiting for a
    // completion event that may never arrive after an interrupted load.
    const generation = beginActionUpdate(tabId, true);
    runBackgroundTask(
      "refresh a loading tab action state",
      () => updateActionForTabAtGeneration(tabId, tab.pendingUrl ?? tab.url, generation),
    );
  }
});

// noinspection JSDeprecatedSymbols
chrome.tabs.onRemoved.addListener((tabId: number) => {
  forgetActionStateForTab(tabId);
});

// noinspection JSDeprecatedSymbols
(chrome.tabs.onReplaced as typeof chrome.tabs.onReplaced | undefined)?.addListener((addedTabId: number, removedTabId: number) => {
  forgetActionStateForTab(removedTabId);
  const generation = beginActionUpdate(addedTabId, true);
  runBackgroundTask(
    "refresh a replaced tab action state",
    () => updateActionForCurrentTabAtGeneration(addedTabId, generation),
  );
});

// noinspection JSDeprecatedSymbols
chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
  if (areaName === "local" && SETTINGS_KEY in changes) {
    if (contextMenuController) {
      runBackgroundTask("synchronize context menus after a settings change", () => contextMenuController.sync());
    }
  }
});

// noinspection JSDeprecatedSymbols
contextMenusApi?.onClicked.addListener((info, tab) => {
  void contextMenuController?.handleClick(info, tab);
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
chrome.runtime.onMessage.addListener((rawMessage: unknown, sender: chrome.runtime.MessageSender) => {
  if (!rawMessage || typeof rawMessage !== "object") {
    return;
  }

  const message = rawMessage as Partial<BackgroundMessage>;
  if (message.protocolVersion !== 1) {
    return;
  }

  if (message.type === "action:sync") {
    // A content script is authoritative only for its own tab. Extension pages
    // such as the popup have no sender.tab and therefore provide the target id.
    const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : message.tabId;
    if (typeof tabId !== "number") {
      return;
    }
    const generation = beginActionUpdate(tabId, true);
    runBackgroundTask(
      "refresh the requested tab action state",
      () => updateActionForCurrentTabAtGeneration(tabId, generation),
    );
    return;
  }

  if (message.type === "release:ensure" && releaseUpdates) {
    runBackgroundTask("ensure the release-update status", () => releaseUpdates.ensureStatus());
  }
});

// A development reload can replace the worker while supported pages remain
// open. Reconcile those tabs as soon as the real extension worker evaluates,
// instead of waiting for the next navigation or activation event.
if (chrome.runtime.id) {
  runBackgroundTask("refresh action states when the background worker starts", refreshAllTabs);
}
