declare const __ADULT_PROVIDERS_ENABLED__: boolean;

export const SETTINGS_KEY = "extension:settings";

export type ProviderSettingKey =
  | "atsu"
  | "mangadex"
  | "ehentai"
  | "exhentai"
  | "comixto"
  | "mangafire"
  | "weebcentral";

export type ProviderLabelMode = "titles" | "icons" | "stacked";
export type LinkTargetType = "current" | "new";
export type OptionsPanelTab = "providers" | "extension" | "info";
export type MangaBakaButtonTarget = "root" | "library" | "profile";
export type ContextMenuMode = "none" | "mangabaka" | "mangabaka_and_providers";
export type ContextMenuLinkType = "new" | "current";

export interface ExtensionSettings {
  enabledProviders: Record<ProviderSettingKey, boolean>;
  providerLabelMode: ProviderLabelMode;
  mangaBakaLinkType: LinkTargetType;
  searchLinkType: LinkTargetType;
  providerLinkType: LinkTargetType;
  contextMenuMode: ContextMenuMode;
  contextMenuLinkType: ContextMenuLinkType;
  optionsPanelTab: OptionsPanelTab;
  mangaBakaButtonTarget: MangaBakaButtonTarget;
  mangaBakaProfileName: string;
}

const AVAILABLE_PROVIDER_KEYS: ProviderSettingKey[] = [
  "atsu",
  "mangadex",
  "comixto",
  "mangafire",
  "weebcentral",
  ...(__ADULT_PROVIDERS_ENABLED__ ? ["ehentai", "exhentai"] as ProviderSettingKey[] : []),
];

export const DEFAULT_ENABLED_PROVIDERS: Record<ProviderSettingKey, boolean> = {
  atsu: true,
  mangadex: true,
  comixto: false,
  mangafire: false,
  weebcentral: false,
  ...(__ADULT_PROVIDERS_ENABLED__ ? { ehentai: false, exhentai: false } : {}),
} as Record<ProviderSettingKey, boolean>;

export const DEFAULT_PROVIDER_LABEL_MODE: ProviderLabelMode = "titles";
export const DEFAULT_MANGABAKA_LINK_TARGET_TYPE: LinkTargetType = "current";
export const DEFAULT_SEARCH_LINK_TARGET_TYPE: LinkTargetType = "new";
export const DEFAULT_PROVIDER_LINK_TARGET_TYPE: LinkTargetType = "new";
export const DEFAULT_CONTEXT_MENU_MODE: ContextMenuMode = "mangabaka";
export const DEFAULT_CONTEXT_MENU_LINK_TYPE: ContextMenuLinkType = "new";
export const DEFAULT_OPTIONS_PANEL_TAB: OptionsPanelTab = "providers";
export const DEFAULT_MANGABAKA_BUTTON_TARGET: MangaBakaButtonTarget = "root";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledProviders: { ...DEFAULT_ENABLED_PROVIDERS },
  providerLabelMode: DEFAULT_PROVIDER_LABEL_MODE,
  mangaBakaLinkType: DEFAULT_MANGABAKA_LINK_TARGET_TYPE,
  searchLinkType: DEFAULT_SEARCH_LINK_TARGET_TYPE,
  providerLinkType: DEFAULT_PROVIDER_LINK_TARGET_TYPE,
  contextMenuMode: DEFAULT_CONTEXT_MENU_MODE,
  contextMenuLinkType: DEFAULT_CONTEXT_MENU_LINK_TYPE,
  optionsPanelTab: DEFAULT_OPTIONS_PANEL_TAB,
  mangaBakaButtonTarget: DEFAULT_MANGABAKA_BUTTON_TARGET,
  mangaBakaProfileName: "",
};

export function normalizeLinkTargetType(
  value: unknown,
  fallback: LinkTargetType = DEFAULT_MANGABAKA_LINK_TARGET_TYPE,
): LinkTargetType {
  return value === "new" || value === "current" ? value : fallback;
}

export function normalizeContextMenuMode(value: unknown): ContextMenuMode {
  switch (value) {
    case "none":
    case "mangabaka":
    case "mangabaka_and_providers":
      return value;
    default:
      return DEFAULT_CONTEXT_MENU_MODE;
  }
}

export function normalizeContextMenuLinkType(value: unknown): ContextMenuLinkType {
  return normalizeLinkTargetType(value, DEFAULT_CONTEXT_MENU_LINK_TYPE);
}

export function isContextMenuLinkTypeEnabled(mode: ContextMenuMode): boolean {
  return mode !== "none";
}

export function normalizeOptionsPanelTab(value: unknown): OptionsPanelTab {
  switch (value) {
    case "providers":
    case "extension":
    case "info":
      return value;
    default:
      return DEFAULT_OPTIONS_PANEL_TAB;
  }
}

export function normalizeMangaBakaButtonTarget(value: unknown): MangaBakaButtonTarget {
  switch (value) {
    case "root":
    case "library":
    case "profile":
      return value;
    default:
      return DEFAULT_MANGABAKA_BUTTON_TARGET;
  }
}

export function normalizeSettings(rawSettings: unknown): ExtensionSettings {
  const settings = asRecord(rawSettings);
  const storedEnabledProviders = asRecord(settings?.enabledProviders);
  const enabledProviders = { ...DEFAULT_ENABLED_PROVIDERS };

  for (const providerKey of AVAILABLE_PROVIDER_KEYS) {
    const storedValue = storedEnabledProviders?.[providerKey];
    if (typeof storedValue === "boolean") {
      enabledProviders[providerKey] = storedValue;
    }
  }
  enabledProviders.comixto = false;

  const providerLabelMode = settings?.providerLabelMode;
  const hasStoredSearchLinkType = settings?.searchLinkType === "current" || settings?.searchLinkType === "new";
  const searchLinkType = normalizeLinkTargetType(
    settings?.searchLinkType,
    normalizeLinkTargetType(settings?.providerLinkType, DEFAULT_SEARCH_LINK_TARGET_TYPE),
  );

  return {
    enabledProviders,
    providerLabelMode: providerLabelMode === "icons" || providerLabelMode === "stacked"
      ? providerLabelMode
      : DEFAULT_PROVIDER_LABEL_MODE,
    mangaBakaLinkType: normalizeLinkTargetType(
      settings?.mangaBakaLinkType,
      DEFAULT_MANGABAKA_LINK_TARGET_TYPE,
    ),
    searchLinkType,
    providerLinkType: hasStoredSearchLinkType
      ? normalizeLinkTargetType(settings?.providerLinkType, DEFAULT_PROVIDER_LINK_TARGET_TYPE)
      : DEFAULT_PROVIDER_LINK_TARGET_TYPE,
    contextMenuMode: normalizeContextMenuMode(settings?.contextMenuMode),
    contextMenuLinkType: normalizeContextMenuLinkType(settings?.contextMenuLinkType),
    optionsPanelTab: normalizeOptionsPanelTab(settings?.optionsPanelTab),
    mangaBakaButtonTarget: normalizeMangaBakaButtonTarget(settings?.mangaBakaButtonTarget),
    mangaBakaProfileName: typeof settings?.mangaBakaProfileName === "string"
      ? settings.mangaBakaProfileName
      : "",
  };
}

export async function loadSettings(
  storage: Pick<chrome.storage.StorageArea, "get"> = chrome.storage.local,
): Promise<ExtensionSettings> {
  const stored = await storage.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(
  settings: ExtensionSettings,
  storage: Pick<chrome.storage.StorageArea, "set"> = chrome.storage.local,
): Promise<void> {
  const normalized = normalizeSettings(settings);
  await storage.set({
    [SETTINGS_KEY]: {
      ...normalized,
      enabledProviders: { ...normalized.enabledProviders },
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
