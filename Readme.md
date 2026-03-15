# MangaBaka URL Finder

Browser extension for matching MangaBaka series to external provider URLs and searching MangaBaka from supported provider pages.

**Not affiliated with the MangaBaka development team.**

## Features

- Reads MangaBaka series metadata from the active tab
- Finds matching provider URLs for enabled providers
- Caches lookup results locally
- Lets you retry or replace bad first-run matches
- Lets you refresh cached MangaBaka results from the saved provider URL
- Searches MangaBaka directly from supported provider series and chapter pages
- Can save a copied provider URL into MangaBaka's `Read Link` field
- Includes an Info tab with build/version details, install source, cache stats, and reset controls

## Supported Providers

Enabled by default:
- `Atsumaru`
- `MangaDex`

Available in options and disabled by default:
- `MangaFire`
- `WeebCentral`
- `E-Hentai`
- `ExHentai`

Disabled in the UI:
- `Comix`

Notes:
- `E-Hentai` and `ExHentai` depend on browser cookies for authenticated access where required.
- Google and Firefox packaged variants exclude `E-Hentai` and `ExHentai` from permissions, popup options, packaged assets, and popup logic.

## Popup Modes

### MangaBaka series page

On `https://mangabaka.org/<id>` pages, the popup runs provider lookups for all enabled providers.

Provider rows can show:
- A matched result
- `Search Now` for newly enabled providers with no cached search yet
- Retry for exhausted title attempts
- `Mark Incorrect` for first-run results
- A refresh icon for cached MangaBaka results

Cached MangaDex results also support manual purge toggling by clicking the displayed chapter line.

### Provider page

On enabled provider domains, the popup switches to provider mode:
- Only the current provider row is active
- `Search MangaBaka` is enabled on supported series/chapter pages
- `Search MangaBaka` is disabled on unsupported pages for that provider
- The button uses the configured `Provider-Link Type`

## Options

### Providers tab

- Enable or disable supported providers
- Choose the provider display mode

### Extension tab

- Set the `MangaBaka-Link Button` target
- Set the optional MangaBaka profile name
- Choose `MangaBaka-Link Type`
- Choose `Provider-Link Type`

### Info tab

- Toggle between version name and build date
- View install source and developer link
- Toggle cache stats between series count and byte size from the `Cache Size` row
- Toggle MangaDex purge ratio between percent and fraction
- Reset the extension with a 3-click confirmation flow

## Project Layout

```text
manifest.json                Base manifest template
popup.html                   Popup markup
popup.css                    Popup styles
src/popup.ts                 Popup state, provider search, cache, provider-page mode, read-link save flow
src/background.ts            Toolbar icon activation logic
src/build-info.ts            Generated build-date constant
scripts/update-build-info.mjs Build-date generator
scripts/build-variant.mjs    Variant build entry point
scripts/package-variant.mjs  Variant packaging entry point
scripts/variant-utils.mjs    Shared variant/build helpers
scripts/clean.mjs            Generated-artifact cleanup
assets/                      Extension icons and provider favicons
dist/                        Default local build output
dist-complete/               Complete variant build output
dist-google/                 Google variant build output
dist-firefox/                Firefox variant build output
webstore-package-complete/   Complete packaged bundle
webstore-package-google/     Google packaged bundle
webstore-package-firefox/    Firefox packaged bundle
```

## Scripts

```bash
npm install
npm run clean
npm run build
npm run watch
npm run build:complete
npm run build:google
npm run build:firefox
npm run package:complete
npm run package:google
npm run package:firefox
npm run package:all
```

What they do:
- `npm run clean` removes generated build and package folders.
- `npm run build` updates build metadata, cleans outputs, and compiles the default local build.
- `npm run watch` runs TypeScript in watch mode.
- `npm run build:complete` builds the complete variant.
- `npm run build:google` builds the Google/store-safe variant.
- `npm run build:firefox` builds the Firefox variant.
- `npm run package:complete` prepares `webstore-package-complete/`.
- `npm run package:google` prepares `webstore-package-google/`.
- `npm run package:firefox` prepares `webstore-package-firefox/`.
- `npm run package:all` packages all three variants sequentially.

## Loading the Extension

### Chromium browsers

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select the project root

### Firefox

1. Run `npm run package:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click `Load Temporary Add-on`
4. Select `webstore-package-firefox/manifest.json`

## Variant Packages

- `Complete`: full feature set, including `E-Hentai` and `ExHentai`
- `Google`: excludes `E-Hentai` and `ExHentai`
- `Firefox`: uses the same `E-Hentai` and `ExHentai` exclusions as Google and appends `version_name` with `(Firefox)`

To prepare distributable folders:

```bash
npm run package:all
```

That produces:

```text
webstore-package-complete/
webstore-package-google/
webstore-package-firefox/
```

## MangaBaka Read Link Save Flow

After copying a provider URL on a MangaBaka page, the copy button becomes a save button for that provider result.

When pressed, the extension:
- Verifies the current page is a MangaBaka series page.
- Checks that the series is already in the MangaBaka library.
- Opens or reuses the series editor.
- Updates the `Read Link` field with the copied provider URL.

If the series is not in the library, the popup reports that requirement instead of writing the link.

## Privacy

See [Privacy Policy.md](/C:/Users/Nick/WebstormProjects/MangaURLExtension/Privacy%20Policy.md) for the current privacy statement.

## License

This repository is licensed under the custom [MIT+LENNOD License](/C:/Users/Nick/WebstormProjects/MangaURLExtension/LICENSE).
