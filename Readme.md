# MangaBaka URL Finder

Browser extension for matching MangaBaka series to provider URLs and searching MangaBaka from supported provider pages.

Not affiliated with the MangaBaka development team.

## Features

- Reads MangaBaka metadata from the active tab and finds matching provider URLs
- Searches MangaBaka directly from supported provider series and chapter pages
- Caches MangaBaka lookup results locally to avoid unnecessary repeat searches
- Shows latest chapter info where the provider exposes it
- Lets you mark bad provider matches and retry with alternate MangaBaka titles
- Optionally saves the selected provider URL into the MangaBaka `Read Link` field for library entries

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
- `ExHentai` uses the same search logic as `E-Hentai`, but it still depends on the browser already having the required authenticated cookies.
- `E-Hentai` and `ExHentai` are excluded from the Google and Firefox packaged variants.

## Popup Behavior

On MangaBaka series pages the popup searches enabled providers for matching source URLs.

On enabled provider domains the popup switches into provider mode:
- only the current provider row is shown
- `Search MangaBaka` is enabled on supported series or chapter pages
- `Search MangaBaka` is disabled on other pages from that provider
- the provider search button follows the `Provider-Link Type` setting

The header also includes a configurable `MangaBaka-Link Button` that can open:
- `Mangabaka.org`
- `Mangabaka.org/my/library`
- `Mangabaka.org/u/profile`

If `Mangabaka.org/u/profile` is selected, the `Profile Name` field is used to build the final URL.

## Tech Stack

- Manifest V3 extension
- Plain TypeScript
- Static HTML and CSS
- No bundler
- No frontend framework

## Project Layout

```text
manifest.json                Base manifest template
popup.html                   Base popup markup
popup.css                    Popup styles
src/popup.ts                 Popup state, provider search, provider-page search, cache, read-link save flow
src/background.ts            Toolbar icon activation logic
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

Generated output folders are intentionally ignored and can be recreated from the scripts below.

## Scripts

```bash
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
- `npm run clean` removes all generated build and package folders
- `npm run build` cleans and recompiles the default local `dist/` output
- `npm run watch` runs TypeScript in watch mode
- `npm run build:complete` builds the full variant into `dist-complete/`
- `npm run build:google` builds the store-safe Chromium variant into `dist-google/`
- `npm run build:firefox` builds the Firefox variant into `dist-firefox/`
- `npm run package:complete` prepares `webstore-package-complete/`
- `npm run package:google` prepares `webstore-package-google/`
- `npm run package:firefox` prepares `webstore-package-firefox/`
- `npm run package:all` builds and packages all three variants sequentially

## Development

### Install

```bash
npm install
```

### Local build

```bash
npm run build
```

### Load in Chromium browsers

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the project root folder

### Load the Firefox variant

1. Run `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click `Load Temporary Add-on`
4. Select `webstore-package-firefox/manifest.json` after running `npm run package:firefox`, or load the root `manifest.json` only if you are testing the default local build layout yourself

### Reload after changes

1. Run the relevant build command again
2. Reload the unpacked extension in the browser

If the toolbar icon appears stale, remove and reload the unpacked extension once.

## Variant Builds

This project supports three package targets:

- `Complete`
  Includes all supported providers, including `E-Hentai` and `ExHentai`.

- `Google`
  Excludes `E-Hentai` and `ExHentai` permissions, popup options, assets, and popup logic for Chrome Web Store distribution.

- `Firefox`
  Uses the same `E-Hentai` and `ExHentai` exclusions as the Google variant and appends `version_name` with `(Firefox)`.

Packaged manifests use:
- `1.1.2 (Complete)`
- `1.1.2 (Google)`
- `1.1.2 (Firefox)`

## Packaging

Prepare all distributable bundles:

```bash
npm run package:all
```

That produces:

```text
webstore-package-complete/
webstore-package-google/
webstore-package-firefox/
```

Each package folder contains only runtime files:
- `manifest.json`
- `popup.html`
- `popup.css`
- `dist/`
- `assets/`

For store submission, zip the contents of the relevant `webstore-package-*` folder rather than the project root.

## MangaBaka Read Link Save Behavior

After copying a provider URL, the copy button turns into a save button. Pressing it will:

- verify the current series is on MangaBaka
- verify the series is in your MangaBaka library
- open or reuse the library editor for that series
- replace the existing `Read Link` with the copied provider URL

If the series is not in your library, the extension reports that you must add it first.
