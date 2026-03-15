import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertVariant,
  cleanPath,
  copyRecursive,
  copyVariantAssets,
  createVariantManifest,
  createVariantPopupHtml,
  ensureDir,
  getVariantBuildDirectoryName,
  getVariantPackageDirectoryName,
  readText,
  writeTextFile,
} from "./variant-utils.mjs";

const variant = process.argv[2] ?? "google";
assertVariant(variant);

const root = process.cwd();
const buildScriptPath = resolve(root, "scripts", "build-variant.mjs");
const outputDir = resolve(root, getVariantPackageDirectoryName(variant));
const distDir = resolve(root, getVariantBuildDirectoryName(variant));

execFileSync(process.execPath, [buildScriptPath, variant], {
  cwd: root,
  stdio: "inherit",
});

cleanPath(outputDir);
ensureDir(outputDir);

writeTextFile(
  resolve(outputDir, "manifest.json"),
  createVariantManifest(variant, readText(resolve(root, "manifest.json"))),
);
writeTextFile(
  resolve(outputDir, "popup.html"),
  createVariantPopupHtml(variant, readText(resolve(root, "popup.html"))),
);
copyRecursive(resolve(root, "popup.css"), resolve(outputDir, "popup.css"));
copyRecursive(distDir, resolve(outputDir, "dist"));
copyVariantAssets(variant, root, resolve(outputDir, "assets"));

console.log(`Prepared ${variant} package in ${outputDir}`);
