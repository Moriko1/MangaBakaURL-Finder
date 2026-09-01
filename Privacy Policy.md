# Privacy Policy

Last updated: 2026-08-31

## Summary

MangaBaka URL Finder processes the minimum page and series information needed to provide extension features. It does not sell user data, use user data for advertising, or include analytics or telemetry.

Requests go directly from the user's browser to MangaBaka, a selected provider, or GitHub. The extension does not send browsing activity or account content to the developer.

## Page access and data processed

The extension may process:

- The active tab URL and whether it is a supported MangaBaka or provider page.
- A MangaBaka series identifier, media type, resolved display title, API titles, and author names.
- A supported provider page title and URL.
- Search terms derived from those titles.
- The optional MangaBaka profile name entered in extension settings.
- A provider URL selected for MangaBaka's `Read Link` field.

A content script starts on `https://mangabaka.org/*` at `document_start` so it can receive the site's current series context even when that context is produced after initial page load or navigation. It keeps only the current URL, parsed series identifier and type, canonical URL, a matching visible `main h1[lang]`, and readiness identifiers in memory. It does not capture or persist MangaBaka account, library, cookie, or list-configuration data; inject visible page controls; track unrelated browsing; or start provider searches by itself. Normal series and provider lookups are initiated through the extension popup.

## Local storage

The extension stores settings and lookup state in `chrome.storage.local`. This may include:

- Enabled provider settings and popup display preferences.
- MangaBaka navigation settings and the optional profile name.
- Cached provider lookup results, exclusions, timestamps, and cached MangaBaka metadata.
- Popup state used to display alternate or inactive titles.
- Release-check timestamps and release metadata for local, non-store installs.

Versioned cache migrations may invalidate old lookup data when matching rules or upstream data conventions change. Only stable provider matches and genuine misses are cached; blocked, rate-limited, authentication, unavailable, network, aborted, and malformed-response outcomes are not. Stored data remains in the browser profile until the user clears it, uses an extension reset control, or uninstalls the extension.

## Network requests

Depending on the active page, enabled providers, and action selected by the user, requests may be sent to:

- `api.mangabaka.org` and `mangabaka.org` for series metadata, MangaBaka navigation, and requested `Read Link` updates.
- `api.github.com` and `github.com` for the once-daily release check used by local, non-store installs and for user-opened project links.
- `atsu.moe`.
- `mangadex.org` and `api.mangadex.org`.
- `mangafire.to`.
- `weebcentral.com`.
- `e-hentai.org` and `exhentai.org` in the Complete package only.

Google and Firefox store packages exclude the E-Hentai and ExHentai implementations, permissions, settings, and assets. They also exclude the local-install release checker and its `alarms` and GitHub API permissions. The extension does not use Yahoo Search and does not request Yahoo permissions.

Remote sites receive the normal information associated with a browser request, such as the requested URL and network address, and handle that information under their own privacy policies. Public MangaBaka and provider requests explicitly omit credentials and do not attach site cookies. The Complete package's user-enabled ExHentai flow is the sole explicit credentialed request and may send the user's existing ExHentai session to ExHentai; the extension does not read or store those credentials.

## Browser permissions

- `storage` stores extension settings, caches, and release state locally.
- `tabs` identifies the active page and opens user-requested destinations.
- `scripting` supports narrowly scoped extraction from supported provider pages.
- `alarms` is requested only by the Complete package and schedules the once-daily GitHub release check for local, non-store installs.
- Host permissions allow direct requests only to MangaBaka, GitHub, and supported providers included in the installed package.

The alarm does not read page content or monitor browsing activity. It only wakes the background worker to refresh local release status.

## Data sharing

The extension has no developer-operated collection endpoint. It does not transmit browsing history, account data, private library contents, or usage analytics to the developer. Data needed for a requested lookup or update is sent only to the site that provides that feature.

## User control

Users can disable providers, clear cached lookups, reset extension settings and local data, and uninstall the extension at any time.

## Contact

- Project: <https://github.com/Moriko1/MangaBakaURL-Finder>
- Chrome Web Store: <https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb>
