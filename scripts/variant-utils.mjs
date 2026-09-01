// noinspection JSUnusedGlobalSymbols
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";

export const VARIANTS = new Set(["complete", "google", "firefox"]);

const BASE_PROVIDER_IDS = ["atsu", "mangadex", "mangafire", "weebcentral", "comixto"];
const ADULT_PROVIDER_IDS = ["ehentai", "exhentai"];

const BASE_HOST_PERMISSIONS = [
  "https://api.mangabaka.org/*",
  "https://mangabaka.org/*",
  "https://mangadex.org/*",
  "https://atsu.moe/*",
  "https://mangafire.to/*",
  "https://weebcentral.com/*",
  "https://api.mangadex.org/*",
];

const LOCAL_RELEASE_UPDATE_HOST_PERMISSIONS = ["https://api.github.com/*"];
const BASE_PERMISSIONS = ["storage", "tabs", "scripting"];

const ADULT_HOST_PERMISSIONS = [
  "https://e-hentai.org/*",
  "https://exhentai.org/*",
];

const COMMON_ASSET_FILES = [
  "icon-color-16.png",
  "icon-color-32.png",
  "icon-color-48.png",
  "icon-color-128.png",
  "icon-gray-16.png",
  "icon-gray-32.png",
  "icon-gray-48.png",
  "icon-gray-128.png",
  "store-icon-128.png",
  "store-small-440x280.png",
  "store-large-1400x560.png",
];

const BASE_PROVIDER_ASSET_FILES = [
  "atsu.ico",
  "mangadex.ico",
  "mangafire.png",
  "weebcentral.ico",
];

export const GENERATED_DIRECTORY_NAMES = [
  "dist",
  "dist-complete",
  "dist-firefox",
  "dist-google",
  "playwright-report",
  "test-results",
  "variant-build",
  "webstore-package-complete",
  "webstore-package-firefox",
  "webstore-package-google",
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

export const GENERATED_FILE_PATHS = ["src/build-info.ts"];

export function assertVariant(variant) {
  if (!VARIANTS.has(variant)) {
    throw new Error(`Unsupported variant: ${variant}`);
  }
}

export function getVariantConfig(variant) {
  assertVariant(variant);
  const includeAdultProviders = variant === "complete";
  const includeLocalReleaseUpdates = variant === "complete";
  /** @type {import("../src/domain/build-variant").BuildVariantConfig} */
  const config = {
    hostPermissions: [
      ...BASE_HOST_PERMISSIONS,
      ...(includeAdultProviders ? ADULT_HOST_PERMISSIONS : []),
      ...(includeLocalReleaseUpdates ? LOCAL_RELEASE_UPDATE_HOST_PERMISSIONS : []),
    ],
    includeAdultProviders,
    includeLocalReleaseUpdates,
    includedProviders: includeAdultProviders
      ? [...BASE_PROVIDER_IDS, ...ADULT_PROVIDER_IDS]
      : [...BASE_PROVIDER_IDS],
    label: variant === "complete" ? "Complete" : variant === "google" ? "Google" : "Firefox",
    manifestBackground: variant === "firefox"
      ? { scripts: ["dist/background.js"] }
      : { service_worker: "dist/background.js" },
    permissions: [
      ...BASE_PERMISSIONS,
      ...(includeLocalReleaseUpdates ? ["alarms"] : []),
    ],
    packagingRules: {
      excludeAdultCode: !includeAdultProviders,
      includeAdultAssets: includeAdultProviders,
      includeAdultMarkup: includeAdultProviders,
    },
    variant,
  };
  return config;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function getVariantBuildDirectoryName(variant) {
  assertVariant(variant);
  return `dist-${variant}`;
}

export function getVariantPackageDirectoryName(variant) {
  assertVariant(variant);
  return `webstore-package-${variant}`;
}

export function writeTextFile(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function cleanPath(path) {
  rmSync(path, { force: true, recursive: true });
}

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function copyRecursive(source, target) {
  ensureDir(dirname(target));
  cpSync(source, target, { recursive: true });
}

export function cleanGeneratedArtifacts(root) {
  for (const directoryName of GENERATED_DIRECTORY_NAMES) {
    cleanPath(resolve(root, directoryName));
  }

  for (const fileName of GENERATED_REPORT_FILE_NAMES) {
    cleanPath(resolve(root, fileName));
  }

  for (const filePath of GENERATED_FILE_PATHS) {
    cleanPath(resolve(root, filePath));
  }

  for (const fileName of readdirSync(root)) {
    if (/^report_.*\.sarif\.json$/i.test(fileName)) {
      cleanPath(resolve(root, fileName));
    }
  }
}

export function getVariantHostPermissions(variant) {
  return [...getVariantConfig(variant).hostPermissions];
}

export function createVariantManifest(variant, manifestContent) {
  const config = getVariantConfig(variant);
  const manifest = JSON.parse(manifestContent);

  manifest.host_permissions = getVariantHostPermissions(variant);
  manifest.permissions = [...config.permissions];
  manifest.version_name = `${manifest.version} (${config.label})`;
  manifest.background = config.manifestBackground;

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function createVariantPopupHtml(variant, popupHtml) {
  const config = getVariantConfig(variant);
  const dom = new JSDOM(popupHtml, { includeNodeLocations: true });
  const adultNodes = [...dom.window.document.querySelectorAll('[data-variant-scope="adult-provider"]')];

  if (adultNodes.length === 0) {
    throw new Error("Popup adult-provider nodes are not marked for variant generation.");
  }

  if (config.packagingRules.includeAdultMarkup) {
    return popupHtml;
  }

  const removalRanges = adultNodes
    .map((node) => dom.nodeLocation(node))
    .map((location) => {
      if (!location) {
        throw new Error("Unable to locate an adult-provider node in popup.html.");
      }
      return { endOffset: location.endOffset, startOffset: location.startOffset };
    })
    .sort((left, right) => right.startOffset - left.startOffset);

  return removalRanges.reduce(
    (html, range) => `${html.slice(0, range.startOffset)}${html.slice(range.endOffset)}`,
    popupHtml,
  );
}

export function copyVariantAssets(variant, root, targetAssetsDir) {
  const config = getVariantConfig(variant);
  const sourceAssetsDir = resolve(root, "assets");
  cleanPath(targetAssetsDir);
  ensureDir(targetAssetsDir);

  for (const file of COMMON_ASSET_FILES) {
    const source = resolve(sourceAssetsDir, file);
    if (existsSync(source)) {
      copyRecursive(source, resolve(targetAssetsDir, file));
    }
  }

  const providerFiles = config.packagingRules.includeAdultAssets
    ? [...BASE_PROVIDER_ASSET_FILES, "ehentai.ico"]
    : BASE_PROVIDER_ASSET_FILES;
  const providerTarget = resolve(targetAssetsDir, "providers");
  ensureDir(providerTarget);

  for (const file of providerFiles) {
    copyRecursive(resolve(sourceAssetsDir, "providers", file), resolve(providerTarget, file));
  }
}
