import { mkdirSync, readFileSync, rmSync, writeFileSync, cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const VARIANTS = new Set(["complete", "google", "firefox"]);
export const GENERATED_DIRECTORY_NAMES = [
  "dist",
  "dist-complete",
  "dist-google",
  "dist-firefox",
  "variant-build",
  "webstore-package-complete",
  "webstore-package-google",
  "webstore-package-firefox",
];
export const GENERATED_REPORT_FILE_NAMES = [
  ".descriptions.xml",
  "CssReplaceWithShorthandSafely.xml",
  "CssUnusedSymbol.xml",
  "ES6MissingAwait.xml",
  "HtmlUnknownTarget.xml",
  "JSDeprecatedSymbols.xml",
  "JSUnresolvedReference.xml",
  "JSUnusedGlobalSymbols.xml",
  "PointlessBooleanExpressionJS.xml",
  "SpellCheckingInspection.xml",
  "UnnecessaryContinueJS.xml",
  "index.html",
  "script.js",
  "styles.css",
];

export function assertVariant(variant) {
  if (!VARIANTS.has(variant)) {
    throw new Error(`Unsupported variant: ${variant}`);
  }
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function getVariantBuildDirectoryName(variant) {
  switch (variant) {
    case "complete":
      return "dist-complete";
    case "google":
      return "dist-google";
    case "firefox":
      return "dist-firefox";
    default:
      throw new Error(`Unsupported variant: ${variant}`);
  }
}

export function getVariantPackageDirectoryName(variant) {
  switch (variant) {
    case "complete":
      return "webstore-package-complete";
    case "google":
      return "webstore-package-google";
    case "firefox":
      return "webstore-package-firefox";
    default:
      throw new Error(`Unsupported variant: ${variant}`);
  }
}

export function writeTextFile(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function cleanPath(path) {
  rmSync(path, { recursive: true, force: true });
}

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function copyRecursive(source, target) {
  cpSync(source, target, { recursive: true });
}

function replaceOrThrow(source, searchValue, replacement, label) {
  const next = source.replace(searchValue, replacement);
  if (next === source) {
    throw new Error(`Failed to transform source for ${label}`);
  }
  return next;
}

export function cleanGeneratedArtifacts(root) {
  for (const directoryName of GENERATED_DIRECTORY_NAMES) {
    cleanPath(resolve(root, directoryName));
  }

  for (const fileName of GENERATED_REPORT_FILE_NAMES) {
    cleanPath(resolve(root, fileName));
  }

  for (const fileName of readdirSync(root)) {
    if (/^report_.*\.sarif\.json$/i.test(fileName)) {
      cleanPath(resolve(root, fileName));
    }
  }
}

export function createVariantManifest(variant, manifestContent) {
  const manifest = JSON.parse(manifestContent);
  manifest.host_permissions = getVariantHostPermissions(variant);

  if (variant === "google" || variant === "firefox") {
    manifest.version_name = `${manifest.version} (${variant === "google" ? "Google" : "Firefox"})`;
  } else if (variant === "complete") {
    manifest.version_name = `${manifest.version} (Complete)`;
  } else {
    delete manifest.version_name;
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function createVariantPopupHtml(variant, popupHtml) {
  if (variant === "complete") {
    return popupHtml;
  }

  return replaceOrThrow(
    popupHtml,
    /\s*<hr class="option-separator" \/>\s*<label class="option-row">\s*<span>E-Hentai<\/span>\s*<input id="option-ehentai" type="checkbox" \/>\s*<\/label>\s*<label class="option-row">\s*<span>ExHentai<\/span>\s*<input id="option-exhentai" type="checkbox" \/>\s*<\/label>/m,
    "",
    "google popup html",
  );
}

export function createVariantPopupSource(variant, popupSource) {
  if (variant === "complete") {
    return popupSource;
  }

  let next = popupSource;

  next = replaceOrThrow(
    next,
    'provider: "Atsumaru" | "Comix" | "E-Hentai" | "ExHentai" | "MangaDex" | "MangaFire" | "WeebCentral";',
    'provider: "Atsumaru" | "Comix" | "MangaDex" | "MangaFire" | "WeebCentral";',
    "ProviderMatch union",
  );

  next = replaceOrThrow(
    next,
    /interface LookupResults \{[\s\S]*?\n}/,
    `interface LookupResults {
  atsu: ProviderMatch | null;
  mangadex: ProviderMatch | null;
  comixto: ProviderMatch | null;
  mangafire: ProviderMatch | null;
  weebcentral: ProviderMatch | null;
}`,
    "LookupResults",
  );

  next = replaceOrThrow(
    next,
    /interface RejectedProviderUrls \{[\s\S]*?\n}/,
    `interface RejectedProviderUrls {
  atsu: string[];
  mangadex: string[];
  comixto: string[];
  mangafire: string[];
  weebcentral: string[];
}`,
    "RejectedProviderUrls",
  );

  next = replaceOrThrow(
    next,
    /function extractEHentaiBaseTitle\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "extractEHentaiBaseTitle",
  );

  next = replaceOrThrow(
    next,
    /const extractEHentaiBaseTitle = \(value: string\): string => \{[\s\S]*?\r?\n\s*};\r?\n\r?\n/,
    "",
    "inline extractEHentaiBaseTitle",
  );

  next = replaceOrThrow(
    next,
    /interface EHentaiSearchResult \{[\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "EHentaiSearchResult",
  );

  next = replaceOrThrow(
    next,
    /const PROVIDER_KEYS:[\s\S]*?const DEFAULT_SETTINGS: ExtensionSettings = \{[\s\S]*?\n};/,
    `const PROVIDER_KEYS: ProviderKey[] = ["atsu", "mangadex", "comixto", "mangafire", "weebcentral"];
const PROVIDERS: Array<{ key: ProviderKey; label: ProviderMatch["provider"] }> = [
  { key: "atsu", label: "Atsumaru" },
  { key: "mangadex", label: "MangaDex" },
  { key: "comixto", label: "Comix" },
  { key: "mangafire", label: "MangaFire" },
  { key: "weebcentral", label: "WeebCentral" },
];
const PROVIDER_LABELS: Record<ProviderKey, ProviderMatch["provider"]> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.key, provider.label]),
) as Record<ProviderKey, ProviderMatch["provider"]>;
const VISIBLE_PROVIDER_KEYS: ProviderKey[] = ["atsu", "mangadex", "mangafire", "weebcentral"];
const PROVIDER_ICON_EXTENSIONS: Record<ProviderKey, string> = {
  atsu: "ico",
  mangadex: "ico",
  comixto: "ico",
  mangafire: "png",
  weebcentral: "ico",
};
const DEFAULT_ENABLED_PROVIDERS: Record<ProviderKey, boolean> = {
  atsu: true,
  mangadex: true,
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
  comixto: null,
  mangafire: null,
  weebcentral: null,
};
const EMPTY_REJECTED_PROVIDER_URLS: RejectedProviderUrls = {
  atsu: [],
  mangadex: [],
  comixto: [],
  mangafire: [],
  weebcentral: [],
};
const EMPTY_TITLE_ATTEMPT_INDEXES: Record<ProviderKey, number> = {
  atsu: 0,
  mangadex: 0,
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
};`,
    "provider constants",
  );

  next = next.replace(/\r?\n\s*wireProviderOption\("ehentai", getEHentaiOptionInput\(\)\);\r?\n\s*wireProviderOption\("exhentai", getExHentaiOptionInput\(\)\);/, "");
  next = next.replace(/\r?\n\s*getEHentaiOptionInput\(\)\.checked = currentSettings\.enabledProviders\.ehentai;\r?\n\s*getExHentaiOptionInput\(\)\.checked = currentSettings\.enabledProviders\.exhentai;/, "");

  next = replaceOrThrow(
    next,
    /async function searchProviders\([\s\S]*?\r?\n}(?=(?:\r?\n){2}async function searchProvider)/,
    `async function searchProviders(
  metadata: MangaBakaMetadata,
  rejectedUrls: RejectedProviderUrls,
  titleAttemptIndexes: Record<ProviderKey, number>,
): Promise<LookupResults> {
  const atsu = currentSettings.enabledProviders.atsu ? await searchAtsumaru(metadata, rejectedUrls.atsu, titleAttemptIndexes.atsu) : null;
  const mangadex = currentSettings.enabledProviders.mangadex ? await searchMangaDex(metadata, rejectedUrls.mangadex, titleAttemptIndexes.mangadex) : null;
  const comixto = null;
  const mangafire = currentSettings.enabledProviders.mangafire ? await searchMangaFire(metadata, rejectedUrls.mangafire, titleAttemptIndexes.mangafire) : null;
  const weebcentral = currentSettings.enabledProviders.weebcentral ? await searchWeebCentral(metadata, rejectedUrls.weebcentral, titleAttemptIndexes.weebcentral) : null;

  return { atsu, mangadex, comixto, mangafire, weebcentral };
}`,
    "searchProviders",
  );

  next = replaceOrThrow(
    next,
    /async function searchProvider\([\s\S]*?\r?\n}(?=(?:\r?\n){2}async function searchAtsumaru)/,
    `async function searchProvider(
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
    case "comixto":
      return null;
    case "mangafire":
      return searchMangaFire(metadata, rejectedUrls.mangafire, titleAttemptIndexes.mangafire);
    case "weebcentral":
      return searchWeebCentral(metadata, rejectedUrls.weebcentral, titleAttemptIndexes.weebcentral);
    default:
      return null;
  }
}`,
    "searchProvider",
  );

  next = replaceOrThrow(
    next,
    /async function searchEHentai\([\s\S]*?\r?\n}\r?\n\r?\nasync function searchMangaFire/,
    `async function searchMangaFire`,
    "searchEHentai function",
  );

  next = replaceOrThrow(
    next,
    /function extractEHentaiSearchResults\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "extractEHentaiSearchResults",
  );

  next = replaceOrThrow(
    next,
    /function canonicalizeEHentaiGalleryUrl\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "canonicalizeEHentaiGalleryUrl",
  );

  next = replaceOrThrow(
    next,
    /function cleanEHentaiGalleryTitle\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "cleanEHentaiGalleryTitle",
  );

  next = replaceOrThrow(
    next,
    /function extractEHentaiTitleCandidates\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "extractEHentaiTitleCandidates",
  );

  next = replaceOrThrow(
    next,
    /function buildEHentaiQueryTitles\([\s\S]*?\r?\n}\r?\n\r?\n/,
    "",
    "buildEHentaiQueryTitles",
  );

  next = replaceOrThrow(
    next,
    /function getProviderIconPath\(providerKey: ProviderKey\): string \{\r?\n\s*const filename = providerKey === "exhentai" \? "ehentai" : providerKey;\r?\n\s*return chrome\.runtime\.getURL\(`assets\/providers\/\$\{filename}\.\$\{PROVIDER_ICON_EXTENSIONS\[providerKey]}`\);\r?\n}/,
    `function getProviderIconPath(providerKey: ProviderKey): string {\n  return chrome.runtime.getURL(\`assets/providers/\${providerKey}.\${PROVIDER_ICON_EXTENSIONS[providerKey]}\`);\n}`,
    "provider icon path",
  );

  next = replaceOrThrow(
    next,
    /function getEHentaiOptionInput\(\): HTMLInputElement \{[\s\S]*?function getProviderLabelModeSelect\(\): HTMLSelectElement \{/,
    `function getProviderLabelModeSelect(): HTMLSelectElement {`,
    "EH option getters",
  );

  next = replaceOrThrow(
    next,
    /\r?\n\s*if \(parsedUrl\.hostname === "e-hentai\.org"\) \{[\s\S]*?\r?\n\s*if \(parsedUrl\.hostname === "exhentai\.org"\) \{[\s\S]*?\r?\n\s*}\r?\n\s*} catch \{/,
    `
  } catch {`,
    "provider page EH route matching",
  );

  next = replaceOrThrow(
    next,
    /\r?\n\s*case "ehentai":\r?\n\s*case "exhentai":\r?\n\s*return extractEHentaiBaseTitle\(trimmed\);/,
    "",
    "provider candidate EH cleaner",
  );

  next = replaceOrThrow(
    next,
    /\r?\n\s*case "ehentai":\r?\n\s*case "exhentai":\r?\n\s*case "comixto":/,
    `\n    case "comixto":`,
    "provider page fetch EH cases",
  );

  next = replaceOrThrow(
    next,
    /\r?\n\s*case "ehentai":\r?\n\s*case "exhentai":\r?\n\s*return extractEHentaiBaseTitle\(trimmed\);/,
    "",
    "global provider title EH cleaner",
  );

  next = replaceOrThrow(
    next,
    /\r?\n\s*case "ehentai":\r?\n\s*case "exhentai": \{\r?\n\s*addSelectorText\(\["#gn", "#gj", "h1"], prioritizedCandidates\);\r?\n\s*break;\r?\n\s*}/,
    "",
    "provider page EH selectors",
  );

  return next;
}

export function getVariantHostPermissions(variant) {
  return variant === "google" || variant === "firefox"
    ? [
      "https://mangabaka.org/*",
      "https://mangadex.org/*",
      "https://atsu.moe/*",
      "https://mangafire.to/*",
      "https://weebcentral.com/*",
      "https://api.mangadex.org/*",
      "https://search.brave.com/*",
      "https://search.yahoo.com/*",
    ]
    : [
      "https://mangabaka.org/*",
      "https://mangadex.org/*",
      "https://atsu.moe/*",
      "https://mangafire.to/*",
      "https://weebcentral.com/*",
      "https://api.mangadex.org/*",
      "https://e-hentai.org/*",
      "https://exhentai.org/*",
      "https://search.brave.com/*",
      "https://search.yahoo.com/*",
    ];
}

export function copyVariantAssets(variant, root, targetAssetsDir) {
  const sourceAssetsDir = resolve(root, "assets");
  cleanPath(targetAssetsDir);
  ensureDir(targetAssetsDir);

  for (const file of ["icon-color-16.png", "icon-color-32.png", "icon-color-48.png", "icon-color-128.png", "icon-gray-16.png", "icon-gray-32.png", "icon-gray-48.png", "icon-gray-128.png", "store-icon-128.png", "store-small-440x280.png", "store-large-1400x560.png"]) {
    const source = resolve(sourceAssetsDir, file);
    if (existsSync(source)) {
      copyRecursive(source, resolve(targetAssetsDir, file));
    }
  }

  const providerTarget = resolve(targetAssetsDir, "providers");
  ensureDir(providerTarget);
  const providerFiles = variant === "google" || variant === "firefox"
    ? ["atsu.ico", "comixto.ico", "mangadex.ico", "mangafire.png", "weebcentral.ico"]
    : ["atsu.ico", "comixto.ico", "ehentai.ico", "mangadex.ico", "mangafire.png", "weebcentral.ico"];

  for (const file of providerFiles) {
    copyRecursive(resolve(sourceAssetsDir, "providers", file), resolve(providerTarget, file));
  }
}
