# Privacy Policy

Last updated: 2026-10-05

## Overview

MangaBaka URL Finder uses page data for series lookups, requested Read Link saves, and selected-text searches invoked from the extension's context menu. It also uses tab URLs to update its toolbar state and checks GitHub release availability for local installs.

The extension does not sell user data, does not use user data for advertising, and does not include analytics or telemetry.

## Data Processed

The extension may read:

- The active tab URL.
- MangaBaka series titles, alternate titles, and author names.
- Supported provider page titles needed for MangaBaka search or cached-result refresh.
- Search terms derived from series titles when performing provider or MangaBaka lookups.
- Text selected by the user when they invoke a context-menu search. The selected text is included in the destination site's search URL.
- The optional MangaBaka profile name entered by the user.

## Local Storage

The extension stores data only in `chrome.storage.local`.

Stored data may include:

- Enabled provider settings.
- Popup display preferences.
- Context-menu mode and current-tab or new-tab preferences.
- MangaBaka link button settings.
- The optional MangaBaka profile name.
- Cached provider lookup results.
- Excluded provider URLs.
- Cached search timestamps.
- The inactive title flip state.
- Release-check status for non-store installs, such as the last check time, current version, latest release metadata, and last attempted check time.

This data stays in the user's browser profile unless the user clears it or uses the extension's reset controls.

## Network Requests

The extension sends requests only when needed to perform user-facing features such as:

- Reading MangaBaka metadata.
- Searching supported providers.
- Refreshing cached provider results.
- Reading provider chapter data.
- Saving a provider URL into MangaBaka's `Read Link` field when requested by the user.
- Opening provider or MangaBaka pages requested by the user.
- Opening a MangaBaka or enabled-provider search for selected text when the user chooses a context-menu action.
- Checking the latest GitHub release once per day for local installs.

Depending on enabled providers and the active page, requests may be sent to:

- Domain: `mangabaka.org`
- Domain: `api.mangabaka.org`
- Domain: `github.com`
- Domain: `api.github.com`
- Domain: `atsu.moe`
- Domain: `mangadex.org`
- Domain: `api.mangadex.org`
- Domain: `mangafire.to`
- Domain: `weebcentral.com`
- Domain: `e-hentai.org`
- Domain: `exhentai.org`

Google and Firefox packaged variants exclude `E-Hentai` and `ExHentai`.

## Context Menus Permission

The extension uses the `contextMenus` permission to add selected-text search actions to the browser's right-click menu. Text is used for a search only when the user chooses one of those actions. Users can select MangaBaka-only searches, include enabled providers, or disable the menu in the extension's options.

## Alarms Permission

The extension uses the `alarms` permission only to schedule a once-daily background task that checks whether a newer project release is available on GitHub for non-store installs. This lets the extension refresh update availability without requiring the user to manually open the popup at the exact time of the check.

The alarm does not read page content, monitor browsing activity, or collect personal information. It only triggers the extension's own background worker to perform the update check and store the resulting timestamp and release status locally in `chrome.storage.local`.

## Data Sharing

The extension does not transmit browsing history, account data, or personal content to the developer.

Any network request made by the extension is sent directly from the user's browser to the destination site needed for the requested feature. No usage data is sent to the developer.

## User Control

Users can:

- Enable or disable providers.
- Configure or disable selected-text context-menu searches.
- Clear cached lookups.
- Reset all extension settings and local data.
- Uninstall the extension at any time.

## Contact

Project page: <https://github.com/Moriko1/MangaBakaURL-Finder>
Chrome Web Store listing: <https://chromewebstore.google.com/detail/mangabaka-url-finder/akngneijkglanfogokinljffohnafhfb>
