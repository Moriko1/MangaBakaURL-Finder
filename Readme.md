# MangaBaka URL Finder

Browser extension for matching MangaBaka series to provider URLs and searching MangaBaka from supported provider pages.

**Not affiliated with the MangaBaka development team.**

## Overview

This extension is designed for two main workflows:

- On a MangaBaka series page, it finds matching provider links for enabled providers.
- On a supported provider page, it lets you search that current series title on MangaBaka.

Most lookup and provider-page logic runs only while the popup window is open.

## Features

- Reads MangaBaka series metadata from the active tab.
- Searches enabled providers for matching series pages.
- Caches lookup results locally for faster repeat use.
- Lets you retry, reject, refresh, or mark provider matches as incorrect.
- Supports MangaDex cached-result purge toggling from the returned chapter line.
- Searches MangaBaka directly from supported provider series and chapter pages.
- Saves a provider URL into MangaBaka's `Read Link` field when the series is already in your library.
- Includes an Info tab with version/build details, install source, developer link, cache stats, and reset controls.

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

- `E-Hentai` and `ExHentai` may depend on browser cookies for authenticated access.
- Google and Firefox packaged variants exclude `E-Hentai` and `ExHentai` from permissions, popup options, packaged assets, and popup logic.

## Popup Behavior

### MangaBaka Series Page

On `https://mangabaka.org/<id>` pages, the popup runs provider lookups for all enabled providers.

Provider rows can show:

- A matched result.
- `Search Now` for newly enabled providers with no cached result yet.
- `Retry` when title attempts are exhausted.
- `Mark Incorrect` for first-run results.
- A refresh icon for cached MangaBaka results.

### Provider Page

On enabled provider domains, the popup switches to provider mode.

- Only the current provider row is active.
- `Search MangaBaka` is enabled on supported series and chapter pages.
- `Search MangaBaka` is disabled on unsupported pages for that provider.
- The button uses the configured `Provider-Link Type`.

## Options

### Providers Tab

- Enable or disable supported providers.
- Choose the provider display mode.

### Extension Tab

- Set the `MangaBaka-Link Button` target.
- Set the optional MangaBaka profile name used for the profile-link target.
- Choose `MangaBaka-Link Type`.
- Choose `Provider-Link Type`.

### Info Tab

- Toggle between version name and build date.
- View install source and developer link.
- Toggle cache stats between series count and byte size from the `Cache Size` row.
- Toggle MangaDex purge ratio between percent and fraction.
- Reset the extension with a 3-click confirmation flow.

## MangaBaka Read Link Save Flow

After copying a provider URL on a MangaBaka page, the copy button becomes a save button for that provider result.

When pressed, the extension:

- Verifies the current page is a MangaBaka series page.
- Checks that the series is already in the MangaBaka library.
- Opens or reuses the series editor.
- Updates the `Read Link` field with the copied provider URL.

If the series is not already in the library, the popup reports that requirement instead of writing the link.

## Project Layout

```text
manifest.json                  Base manifest template
popup.html                     Popup markup
popup.css                      Popup styles
src/background.ts              Toolbar icon state logic
src/popup.ts                   Popup state, provider search, cache, provider mode, and read-link handling
src/build-info.ts              Generated build-date constant
scripts/update-build-info.mjs  Build-date generator
scripts/build-variant.mjs      Variant build entry point
scripts/package-variant.mjs    Variant packaging entry point
scripts/variant-utils.mjs      Shared variant/build helpers
scripts/clean.mjs              Generated-artifact cleanup
assets/                        Extension icons and provider favicons
dist/                          Default local build output
dist-complete/                 Complete variant build output
dist-google/                   Google variant build output
dist-firefox/                  Firefox variant build output
webstore-package-complete/     Complete packaged bundle
webstore-package-google/       Google packaged bundle
webstore-package-firefox/      Firefox packaged bundle
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

Script summary:

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

### Chromium Browsers

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project root.

### Firefox

1. Run `npm run package:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Select `webstore-package-firefox/manifest.json`.

## Variant Packages

- `Complete`: Full feature set, including `E-Hentai` and `ExHentai`.
- `Google`: Excludes `E-Hentai` and `ExHentai`.
- `Firefox`: Uses the same `E-Hentai` and `ExHentai` exclusions as Google and appends `version_name` with `(Firefox)`.

To prepare distributable folders:

```bash
npm run package:all
```

This produces:

```text
webstore-package-complete/
webstore-package-google/
webstore-package-firefox/
```

## Privacy

See [Privacy Policy.md](./Privacy%20Policy.md) for the current privacy statement.

## License

This repository is licensed under the custom [MIT+LENNOD License](./LICENSE).

Embedded emoji SVG shapes in the popup are based on [Twemoji](https://github.com/jdecked/twemoji), licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
