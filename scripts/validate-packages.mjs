import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import process from "node:process";
import { getVariantPackageDirectoryName, VARIANTS } from "./variant-utils.mjs";

const root = process.cwd();
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const requiredDistFiles = ["background.js", "build-info.js", "content.js", "popup.js"];
const forbiddenEverywhere = [/search\.yahoo\.com/i];
const forbiddenInStoreBuilds = [/e-?hentai/i, /exhentai/i];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      result.push(...collectFiles(path));
      continue;
    }

    result.push(path);
  }
  return result;
}

for (const variant of VARIANTS) {
  const packageRoot = resolve(root, getVariantPackageDirectoryName(variant));
  assert(existsSync(packageRoot), `${variant}: package directory is missing.`);

  const manifestPath = resolve(packageRoot, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert(manifest.version === packageVersion, `${variant}: manifest version does not match package.json.`);
  assert(manifest.version_name === `${packageVersion} (${variant === "complete" ? "Complete" : variant === "google" ? "Google" : "Firefox"})`, `${variant}: version_name is incorrect.`);
  assert(!manifest.web_accessible_resources, `${variant}: internal action icons must not be exposed to websites.`);
  assert(manifest.host_permissions.includes("https://api.mangabaka.org/*"), `${variant}: MangaBaka API permission is missing.`);
  assert(!manifest.host_permissions.includes("https://search.yahoo.com/*"), `${variant}: Yahoo permission must not be present.`);
  if (variant === "complete") {
    assert(manifest.permissions.includes("alarms"), "complete: local release alarm permission is missing.");
    assert(manifest.host_permissions.includes("https://api.github.com/*"), "complete: GitHub release API permission is missing.");
  } else {
    assert(!manifest.permissions.includes("alarms"), `${variant}: unused alarms permission must be excluded.`);
    assert(!manifest.host_permissions.includes("https://api.github.com/*"), `${variant}: unused GitHub API permission must be excluded.`);
  }

  const contentScript = manifest.content_scripts?.find((entry) => entry.js?.includes("dist/content.js"));
  assert(contentScript, `${variant}: MangaBaka content script is missing.`);
  assert(contentScript.run_at === "document_start", `${variant}: content script must run at document_start.`);
  assert(contentScript.matches?.includes("https://mangabaka.org/*"), `${variant}: content script MangaBaka match is missing.`);

  if (variant === "firefox") {
    assert(Array.isArray(manifest.background?.scripts), "firefox: background.scripts is required.");
    assert(manifest.background.scripts.includes("dist/background.js"), "firefox: background script path is incorrect.");
    assert(!("service_worker" in manifest.background), "firefox: service_worker must not be emitted.");
  } else {
    assert(manifest.background?.service_worker === "dist/background.js", `${variant}: service worker path is incorrect.`);
    assert(!("scripts" in manifest.background), `${variant}: background.scripts must not be emitted.`);
  }

  for (const file of requiredDistFiles) {
    assert(existsSync(resolve(packageRoot, "dist", file)), `${variant}: dist/${file} is missing.`);
  }
  const backgroundBundle = readFileSync(resolve(packageRoot, "dist", "background.js"), "utf8");
  if (variant !== "complete") {
    assert(!backgroundBundle.includes("api.github.com"), `${variant}: local release-update code must be excluded.`);
    assert(!backgroundBundle.includes("extension:release-update-check"), `${variant}: local release alarm code must be excluded.`);
  }

  const hasEHentaiPermission = manifest.host_permissions.includes("https://e-hentai.org/*");
  const hasExHentaiPermission = manifest.host_permissions.includes("https://exhentai.org/*");
  const adultAssetPath = resolve(packageRoot, "assets", "providers", "ehentai.ico");
  assert(!existsSync(resolve(packageRoot, "assets", "providers", "comixto.ico")), `${variant}: disabled Comix asset must not be packaged.`);
  const popupHtml = readFileSync(resolve(packageRoot, "popup.html"), "utf8");
  if (variant === "complete") {
    assert(hasEHentaiPermission && hasExHentaiPermission, "complete: adult provider permissions are missing.");
    assert(existsSync(adultAssetPath), "complete: adult provider asset is missing.");
    assert(popupHtml.includes('id="option-ehentai"') && popupHtml.includes('id="option-exhentai"'), "complete: adult provider settings are missing.");
  } else {
    assert(!hasEHentaiPermission && !hasExHentaiPermission, `${variant}: adult provider permissions must be excluded.`);
    assert(!existsSync(adultAssetPath), `${variant}: adult provider asset must be excluded.`);
    assert(!popupHtml.includes('data-variant-scope="adult-provider"'), `${variant}: adult provider popup nodes must be excluded.`);
  }

  for (const path of collectFiles(packageRoot)) {
    const packagePath = relative(packageRoot, path);
    for (const pattern of forbiddenEverywhere) {
      assert(!pattern.test(packagePath), `${variant}: ${packagePath} contains a forbidden Yahoo integration identifier.`);
    }
    if (variant !== "complete") {
      for (const pattern of forbiddenInStoreBuilds) {
        assert(!pattern.test(packagePath), `${variant}: ${packagePath} contains an adult-provider asset or identifier (${pattern}).`);
      }
    }

    if (!textExtensions.has(extname(path))) {
      continue;
    }

    const content = readFileSync(path, "utf8");
    for (const pattern of forbiddenEverywhere) {
      assert(!pattern.test(content), `${variant}: ${packagePath} contains forbidden Yahoo integration text.`);
    }
    if (variant !== "complete") {
      for (const pattern of forbiddenInStoreBuilds) {
        assert(!pattern.test(content), `${variant}: ${packagePath} contains adult-provider text (${pattern}).`);
      }
    }
  }

  console.log(`Validated ${variant} package.`);
}
