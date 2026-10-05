# MangaBaka URL Finder

Browser extension for matching MangaBaka series to provider URLs and searching MangaBaka from supported provider pages.

Google: https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb

Firefox: Link TBD

**Not affiliated with the MangaBaka development team**

## Overview

#### Workflow:
- On MangaBaka: Finds matching links on external manga reading sites
- On supported manga sites: Quickly search/navigate to the series' on MangaBaka

#### Additional features:
- Optionally save URL into your MangaBaka Library's `Read Link` field
- Search selected text through the right-click context menu
- Caches lookup results locally for faster repeat use
- Series matching runs while the popup window is open

## Supported Providers

Enabled by default:

- `Atsumaru`
- `MangaDex`

Available in options and disabled by default:

- `MangaFire`
- `WeebCentral`
- `E-Hentai`
- `ExHentai`

Currently Disabled:

- `Comix` (TBD)

Notes:

- `ExHentai` depends on browser cookies for authenticated access
- Google and Firefox packaged variants exclude `E-Hentai` and `ExHentai` due to 18+ limitations

## Setup/Build

1. Install Node.js
2. Run `npm ci`
3. Run `npm run build`
4. Run `npm run package:all`

## Scripts

- `npm run clean` removes generated build and package folders
- `npm run build` updates build metadata, cleans outputs, and compiles the default local build
- `npm run watch` runs TypeScript in watch mode
- `npm run build:complete` builds the complete variant
- `npm run build:google` builds the Google/store-safe variant
- `npm run build:firefox` builds the Firefox variant
- `npm run build:all` builds all three variants sequentially
- `npm run package:complete` prepares `webstore-package-complete/`
- `npm run package:google` prepares `webstore-package-google/`
- `npm run package:firefox` prepares `webstore-package-firefox/`
- `npm run package:all` packages all three variants sequentially

## Version Differences

- `Complete`: Full feature set
- `Google`: Excludes 18+ providers
- `Firefox`: Excludes 18+ providers

### Chromium Browsers

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

## Privacy

See [Privacy Policy.md](./Privacy%20Policy.md) for the current privacy statement.

## License

This repository is licensed under the custom [MIT+LENNOD License](./LICENSE)

Embedded emoji SVG shapes in the popup are based on [Twemoji](https://github.com/jdecked/twemoji), licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
