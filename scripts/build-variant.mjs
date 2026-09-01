import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process, { argv, execPath } from "node:process";
import { build, context } from "esbuild";
import {
  assertVariant,
  cleanPath,
  ensureDir,
  getVariantBuildDirectoryName,
  getVariantConfig,
} from "./variant-utils.mjs";

const variant = argv[2] ?? "complete";
assertVariant(variant);

const flags = new Set(argv.slice(3));
const isLocalBuild = flags.has("--local");
const isWatchBuild = flags.has("--watch");
const root = process.cwd();
const config = getVariantConfig(variant);
const outDir = resolve(root, isLocalBuild ? "dist" : getVariantBuildDirectoryName(variant));
const updateBuildInfoScriptPath = resolve(root, "scripts", "update-build-info.mjs");

execFileSync(execPath, [updateBuildInfoScriptPath], {
  cwd: root,
  stdio: "inherit",
});

cleanPath(outDir);
ensureDir(outDir);

const buildOptions = {
  absWorkingDir: root,
  bundle: true,
  define: {
    __ADULT_PROVIDERS_ENABLED__: JSON.stringify(config.includeAdultProviders),
    __BUILD_VARIANT__: JSON.stringify(variant),
    __LOCAL_RELEASE_UPDATES_ENABLED__: JSON.stringify(config.includeLocalReleaseUpdates),
  },
  entryNames: "[name]",
  entryPoints: {
    background: "./src/background.ts",
    "build-info": "./src/build-info.ts",
    content: "./src/entries/content.ts",
    popup: "./src/popup.ts",
  },
  format: "iife",
  legalComments: "none",
  logLevel: "info",
  minify: !isLocalBuild,
  outdir: outDir,
  platform: "browser",
  sourcemap: false,
  target: ["es2020"],
  treeShaking: true,
  tsconfig: "./tsconfig.json",
};

if (isWatchBuild) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
  console.log(`Watching ${config.label} sources into ${outDir}`);
} else {
  await build(buildOptions);
}
