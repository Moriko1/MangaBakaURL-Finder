import type { ExtensionSettings } from "../settings";
import { buildMangaBakaManualSearchUrl } from "../providers/manual-search";
import {
  getProviderSearchTarget,
  PROVIDER_SEARCH_TARGETS,
  type ProviderSearchTarget,
  type ProviderSearchTargetId,
} from "../providers/search-targets";

declare const __BUILD_VARIANT__: "complete" | "google" | "firefox";

const MENU_ID_PREFIX = "mangabaka-url-finder.search-title";
const PROVIDER_MENU_ID_PREFIX = `${MENU_ID_PREFIX}.provider.`;
const MANGABAKA_CONTEXT_MENU_ICONS = Object.freeze({
  "16": "assets/icon-color-16.png",
  "32": "assets/icon-color-32.png",
});

type BuildVariant = "complete" | "google" | "firefox";
type ContextMenuIconPaths = Readonly<Record<string, string>>;
type BrowserContextMenuCreateProperties = chrome.contextMenus.CreateProperties & {
  icons?: Record<string, string>;
};

export const CONTEXT_MENU_IDS = Object.freeze({
  mangaBaka: `${MENU_ID_PREFIX}.mangabaka`,
  parent: `${MENU_ID_PREFIX}.parent`,
});

export interface ContextMenuControllerOptions {
  readonly contextMenus: Pick<typeof chrome.contextMenus, "create" | "removeAll">;
  readonly tabs: Pick<typeof chrome.tabs, "create" | "update">;
  readonly loadSettings: () => Promise<ExtensionSettings>;
  readonly getLastErrorMessage: () => string | null;
  readonly warn?: (message: string, error?: unknown) => void;
}

export interface ContextMenuController {
  sync(): Promise<void>;
  handleClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void>;
}

interface SyncWaiter {
  generation: number;
  resolve: () => void;
}

type ResolvedSearchTarget =
  | { kind: "mangabaka" }
  | { kind: "provider"; target: ProviderSearchTarget };

export function normalizeSelectedTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized || null;
}

export function getProviderContextMenuId(providerId: ProviderSearchTargetId): string {
  return `${PROVIDER_MENU_ID_PREFIX}${providerId}`;
}

export function getSupportedContextMenuIcons(
  iconPaths: ContextMenuIconPaths,
  buildVariant: BuildVariant = __BUILD_VARIANT__,
): Record<string, string> | undefined {
  return buildVariant === "firefox" ? { ...iconPaths } : undefined;
}

function withSupportedSubmenuIcons(
  properties: chrome.contextMenus.CreateProperties,
  iconPaths: ContextMenuIconPaths,
): BrowserContextMenuCreateProperties {
  const icons = getSupportedContextMenuIcons(iconPaths);
  return icons ? { ...properties, icons } : properties;
}

function resolveSearchTarget(menuItemId: string | number): ResolvedSearchTarget | null {
  if (menuItemId === CONTEXT_MENU_IDS.mangaBaka) {
    return { kind: "mangabaka" };
  }
  if (typeof menuItemId !== "string" || !menuItemId.startsWith(PROVIDER_MENU_ID_PREFIX)) {
    return null;
  }

  const providerId = menuItemId.slice(PROVIDER_MENU_ID_PREFIX.length) as ProviderSearchTargetId;
  const target = getProviderSearchTarget(providerId);
  return target ? { kind: "provider", target } : null;
}

function runtimeError(options: ContextMenuControllerOptions): Error | null {
  const message = options.getLastErrorMessage();
  return message ? new Error(message) : null;
}

function removeAllContextMenus(options: ContextMenuControllerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      options.contextMenus.removeAll(() => {
        const error = runtimeError(options);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createContextMenuItem(
  options: ContextMenuControllerOptions,
  properties: BrowserContextMenuCreateProperties,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      options.contextMenus.create(properties, () => {
        const error = runtimeError(options);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function updateTab(
  options: ContextMenuControllerOptions,
  tabId: number,
  url: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      options.tabs.update(tabId, { url }, () => {
        const error = runtimeError(options);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createTab(options: ContextMenuControllerOptions, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      options.tabs.create({ url }, () => {
        const error = runtimeError(options);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function isProviderEnabled(settings: ExtensionSettings, providerId: ProviderSearchTargetId): boolean {
  return settings.enabledProviders[providerId] === true;
}

export function createContextMenuController(
  options: ContextMenuControllerOptions,
): ContextMenuController {
  const warn = options.warn ?? ((message: string, error?: unknown) => console.warn(message, error));
  let requestedGeneration = 0;
  let completedGeneration = 0;
  let syncRunner: Promise<void> | null = null;
  let appliedMenuSignature: string | null = null;
  const syncWaiters: SyncWaiter[] = [];

  function resolveCompletedWaiters(): void {
    for (let index = syncWaiters.length - 1; index >= 0; index -= 1) {
      if (syncWaiters[index].generation <= completedGeneration) {
        syncWaiters[index].resolve();
        syncWaiters.splice(index, 1);
      }
    }
  }

  async function rebuildMenus(settings: ExtensionSettings, generation: number): Promise<void> {
    if (generation !== requestedGeneration) {
      return;
    }

    appliedMenuSignature = null;
    await removeAllContextMenus(options);
    if (generation !== requestedGeneration || settings.contextMenuMode === "none") {
      return;
    }

    if (settings.contextMenuMode === "mangabaka") {
      await createContextMenuItem(options, {
        id: CONTEXT_MENU_IDS.mangaBaka,
        title: "Search Title in MangaBaka",
        contexts: ["selection"],
      });
      return;
    }

    await createContextMenuItem(options, {
      id: CONTEXT_MENU_IDS.parent,
      title: "Search Title in…",
      contexts: ["selection"],
    });
    if (generation !== requestedGeneration) {
      return;
    }

    await createContextMenuItem(options, withSupportedSubmenuIcons({
      id: CONTEXT_MENU_IDS.mangaBaka,
      parentId: CONTEXT_MENU_IDS.parent,
      title: "MangaBaka",
      contexts: ["selection"],
    }, MANGABAKA_CONTEXT_MENU_ICONS));

    for (const target of PROVIDER_SEARCH_TARGETS) {
      if (generation !== requestedGeneration) {
        return;
      }
      if (!isProviderEnabled(settings, target.providerId)) {
        continue;
      }
      await createContextMenuItem(options, withSupportedSubmenuIcons({
        id: getProviderContextMenuId(target.providerId),
        parentId: CONTEXT_MENU_IDS.parent,
        title: target.label,
        contexts: ["selection"],
      }, target.contextMenuIcons));
    }
  }

  function ensureSyncRunner(): void {
    if (syncRunner) {
      return;
    }

    syncRunner = (async () => {
      while (completedGeneration < requestedGeneration) {
        const generation = requestedGeneration;
        try {
          const settings = await options.loadSettings();
          const menuSignature = JSON.stringify([
            settings.contextMenuMode,
            settings.contextMenuMode === "mangabaka_and_providers"
              ? PROVIDER_SEARCH_TARGETS.filter((target) => isProviderEnabled(settings, target.providerId))
                .map((target) => target.providerId)
              : [],
          ]);
          if (menuSignature !== appliedMenuSignature) {
            await rebuildMenus(settings, generation);
            if (generation === requestedGeneration) {
              appliedMenuSignature = menuSignature;
            }
          }
        } catch (error) {
          warn("Failed to synchronize the selected-title context menu.", error);
        }
        completedGeneration = generation;
        resolveCompletedWaiters();
      }
    })().finally(() => {
      syncRunner = null;
      if (completedGeneration < requestedGeneration) {
        ensureSyncRunner();
      }
    });
  }

  function sync(): Promise<void> {
    const generation = ++requestedGeneration;
    const completion = new Promise<void>((resolve) => {
      syncWaiters.push({ generation, resolve });
    });
    ensureSyncRunner();
    return completion;
  }

  async function openSearch(url: string, linkType: ExtensionSettings["contextMenuLinkType"], tabId?: number): Promise<void> {
    if (linkType === "current" && typeof tabId === "number") {
      try {
        await updateTab(options, tabId, url);
        return;
      } catch {
        // The originating tab may have closed or become unavailable after the menu opened.
      }
    }
    await createTab(options, url);
  }

  async function handleClickWithoutErrorBoundary(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
  ): Promise<void> {
    const target = resolveSearchTarget(info.menuItemId);
    const title = normalizeSelectedTitle(info.selectionText);
    if (!target || !title) {
      return;
    }

    const settings = await options.loadSettings();
    if (settings.contextMenuMode === "none") {
      return;
    }

    let url: string;
    if (target.kind === "mangabaka") {
      url = buildMangaBakaManualSearchUrl(title);
    } else {
      if (
        settings.contextMenuMode !== "mangabaka_and_providers"
        || !isProviderEnabled(settings, target.target.providerId)
      ) {
        return;
      }
      url = target.target.buildSearchUrl(title);
    }

    await openSearch(url, settings.contextMenuLinkType, tab?.id);
  }

  async function handleClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
  ): Promise<void> {
    try {
      await handleClickWithoutErrorBoundary(info, tab);
    } catch (error) {
      warn("Failed to open the selected-title search.", error);
    }
  }

  return { sync, handleClick };
}
