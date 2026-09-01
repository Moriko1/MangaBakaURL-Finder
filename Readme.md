# MangaBaka URL Finder

MangaBaka URL Finder is a browser extension that matches a MangaBaka series with supported manga-provider URLs and helps navigate back to MangaBaka from supported provider pages.

- [Chrome Web Store](https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb)
- Firefox listing: pending

This project is not affiliated with the MangaBaka development team.

## What it does

On a MangaBaka series page, the extension ranks the series titles supplied by MangaBaka's public API, searches enabled providers, shows the matches in the popup, and can save a chosen URL to MangaBaka's `Read Link` field when requested.

On a supported provider page, the popup derives the current title and offers a MangaBaka search or navigation action. MangaDex chapter pages resolve their parent series through the MangaDex API so chapter names are never used as MangaBaka search titles. Lookup results and extension preferences are cached locally for faster repeat use. Cache schema v12 stores validated MangaBaka API metadata, ranked titles, title fingerprints, and stable provider result state; transient network, rate-limit, authentication, blocked, aborted, and malformed-response outcomes are not cached.

MangaBaka pages receive a small content bridge at `document_start`. The bridge captures the current page's series context and makes it available to the extension; it does not add page UI or independently launch provider searches. The popup remains the user interface and initiates normal lookups. A background task checks GitHub once per day for updates to local, non-store installs.

Recognized MangaBaka series URLs include legacy numeric routes and current `/manga`, `/manhwa`, `/manhua`, `/novel`, `/oel`, and `/other` routes, with or without slugs, trailing slashes, queries, and fragments. API metadata remains authoritative when a late-injected bridge missed an earlier page event.

### MangaBaka title selection

For deterministic matching, API titles are grouped in this order:

1. English (`en`).
2. The media type's romanized language: `ja-Latn` for manga and novels, `ko-Latn` for manhwa, or `zh-Latn` for manhua.
3. The media type's native language: `ja`, `ko`, or `zh`. Original English-language works are already covered by the first group.
4. All remaining language groups.

Within a language group, primary titles come first, followed by the traits official, native, alternative, and unclassified. API order breaks ties, and normalized duplicate text is removed. A title resolved by the MangaBaka page is displayed only when it matches an API title; otherwise the first ranked API title is used.

### Data attribution

Series metadata is provided by the [MangaBaka public API](https://mangabaka.org/data/api). MangaBaka-original data and metadata supplied by its upstream providers remain subject to the licenses and terms identified in the API documentation.

## Supported providers

Enabled by default:

- Atsumaru
- MangaDex

Available but disabled by default:

- MangaFire
- WeebCentral
- E-Hentai (Complete package only)
- ExHentai (Complete package only; requires a valid site session)

Comix is shown as unavailable while its adapter remains unfinished.

Provider names and icons in result rows link to each provider's homepage. `Search-Link Type` controls the destination used by lookup-result, manual-search, and provider-page MangaBaka search actions. The separate `Provider-Link Type` controls provider-name homepage links and defaults to opening a new tab. Existing pre-v1.6 settings migrate their former Provider-Link preference to Search-Link Type while the new provider-homepage preference starts at the new-tab default.

## Package variants

- `Complete` includes every adapter, including E-Hentai and ExHentai.
- `Google` is the Chrome Web Store build and excludes adult-provider code, permissions, assets, settings, and the local-install release checker.
- `Firefox` is the Firefox store build, applies the same exclusions, and emits Manifest V3 `background.scripts` for Firefox compatibility.

All variants include the MangaBaka `document_start` content bridge and permission for `https://api.mangabaka.org/*`. Yahoo Search is not used or requested. Store builds also omit the unused `alarms` and GitHub API permissions.

## Development

Node.js 22.14 or newer is required.

```text
npm ci
npm run build
```

The local `npm run build` writes an unpacked Complete build to `dist/`; load the repository root from `chrome://extensions` after enabling Developer mode.

Useful commands:

- `npm run typecheck` checks TypeScript without emitting files.
- `npm test` runs the Vitest unit and integration suite in jsdom.
- `npm run build:all` bundles all three variants with esbuild.
- `npm run package:all` creates `webstore-package-complete/`, `webstore-package-google/`, and `webstore-package-firefox/`.
- `npm run test:packages` validates each generated manifest, required asset, bundle, and store exclusion.
- `npm run check` type-checks, tests, packages, and validates all variants.
- `npm run clean` removes generated build and package directories.
- `npm run watch` watches the local Complete build.

The build keeps `dist/build-info.js` as a separate popup artifact while bundling the background worker, popup, and content bridge independently.

### Loaded-extension smoke test

Install Playwright's Chromium once, generate the packages, and run the smoke test:

```text
npx playwright install chromium
npm run package:google
npm run test:e2e
```

The smoke test launches the generated Google package in Chromium, opens its real extension popup, and confirms both its core UI and adult-provider exclusion. CI installs Chromium with its Linux dependencies and runs this test automatically.

### Firefox temporary installation

Run `npm run package:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `webstore-package-firefox/manifest.json`.

## Project notes

- [Deferred development suggestions](./DevelopmentSuggestions.md)
- [Privacy policy](./Privacy%20Policy.md)

## License

This repository uses the custom [MIT+LENNOD License](./LICENSE).

Embedded emoji SVG shapes in the popup are based on [Twemoji](https://github.com/jdecked/twemoji), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
