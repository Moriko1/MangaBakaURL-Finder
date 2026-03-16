import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process, { argv, execPath } from "node:process";
import {
  assertVariant,
  cleanPath,
  createVariantPopupSource,
  ensureDir,
  getVariantBuildDirectoryName,
  readText,
  writeTextFile,
} from "./variant-utils.mjs";

const variant = argv[2] ?? "complete";
assertVariant(variant);

const root = process.cwd();
const variantRoot = resolve(root, "variant-build", variant);
const tempSrcDir = resolve(variantRoot, "src");
const tempTsconfigPath = resolve(variantRoot, "tsconfig.json");
const outDir = resolve(root, getVariantBuildDirectoryName(variant));
const tscPath = resolve(root, "node_modules", "typescript", "bin", "tsc");
const updateBuildInfoScriptPath = resolve(root, "scripts", "update-build-info.mjs");

execFileSync(execPath, [updateBuildInfoScriptPath], {
  cwd: root,
  stdio: "inherit",
});

cleanPath(variantRoot);
cleanPath(outDir);
ensureDir(tempSrcDir);

writeTextFile(resolve(tempSrcDir, "background.ts"), readText(resolve(root, "src", "background.ts")));
writeTextFile(resolve(tempSrcDir, "build-info.ts"), readText(resolve(root, "src", "build-info.ts")));
writeTextFile(resolve(tempSrcDir, "chrome.d.ts"), readText(resolve(root, "src", "chrome.d.ts")));
writeTextFile(
  resolve(tempSrcDir, "popup.ts"),
  createVariantPopupSource(variant, readText(resolve(root, "src", "popup.ts"))),
);

writeTextFile(
  tempTsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        target: "es2020",
        lib: ["dom", "es2020"],
        module: "commonjs",
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        outDir,
      },
      include: [resolve(tempSrcDir, "*.ts")],
    },
    null,
    2,
  ),
);

execFileSync(execPath, [tscPath, "-p", tempTsconfigPath], {
  cwd: root,
  stdio: "inherit",
});
