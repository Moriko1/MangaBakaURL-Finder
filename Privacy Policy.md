# Privacy Policy

Last updated: 2026-03-15

## Overview

MangaBaka URL Finder processes page data only to perform the features requested by the user inside the extension popup.

The extension does not sell user data, does not use user data for advertising, and does not include analytics or telemetry.

## Data Processed

The extension may read:
- The active tab URL
- MangaBaka series titles, alternate titles, and author names
- Supported provider page titles needed for MangaBaka search or cached-result refresh
- The optional MangaBaka profile name entered by the user

## Local Storage

The extension stores data only in `chrome.storage.local`.

Stored data may include:
- Enabled provider settings
- Popup display preferences
- MangaBaka link button settings
- Cached provider lookup results
- Excluded provider URLs
- Cached search timestamps
- The inactive title flip state

This data stays on the user's browser profile unless the user clears it or uses the extension's reset controls.

## Network Requests

The extension sends requests only when needed to perform user-facing features such as:
- Reading MangaBaka metadata
- Searching supported providers
- Refreshing cached provider results
- Reading provider chapter data
- Opening provider or MangaBaka pages requested by the user

Depending on enabled providers and the active page, requests may be sent to:
- `mangabaka.org`
- `atsu.moe`
- `mangadex.org`
- `api.mangadex.org`
- `mangafire.to`
- `weebcentral.com`
- `e-hentai.org`
- `exhentai.org`
- `search.brave.com`
- `search.yahoo.com`

Google and Firefox packaged variants exclude `E-Hentai` and `ExHentai`.

## Data Sharing

The extension does not transmit browsing history, account data, or personal content to the developer.

Any network request made by the extension is sent directly from the user's browser to the destination site needed for the requested feature.

## User Control

Users can:
- Enable or disable providers
- Clear cached lookups
- Reset all extension settings and local data
- Remove the extension at any time

## Contact

Project page:

`https://github.com/Moriko1/MangaBakaURL-Finder`
