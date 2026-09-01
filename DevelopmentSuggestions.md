# Deferred Development Suggestions

This is the post-v1.6 product and engineering backlog. It records evidence observed during the v1.6 modernization, not commitments or hidden v1.6 scope. Priorities are relative: P1 is the strongest near-term candidate, P2 is valuable follow-up work, and P3 is exploratory.

## 1. Major popup redesign and richer progress UI

**Evidence — 2026-08-31 repository audit:** v1.6 deliberately preserves the existing popup visuals. Lookup, provider status, settings, confirmation, and error rendering still share one large popup surface, and progress is summarized primarily through the status bar and provider rows.

**Priority:** P2

**Problem:** Long or partial searches do not expose enough structured progress, cancellation state, provider-specific failure detail, or recovery guidance. The popup's current density also makes substantial interaction changes risky.

**Value:** A redesign could make slow and failed lookups understandable, improve keyboard and screen-reader use, and reduce accidental retries or destructive actions.

**Approach:** First map the current state machine and accessibility behavior. Prototype a componentized popup with per-provider phases, explicit cancellation/retry controls, stable empty/error states, and a compact summary. Preserve the current feature set during migration and add rendered regression coverage before changing visual language.

**Dependencies / policy constraints:** Requires a product/design decision on layout and information density; must preserve extension-popup size limits, keyboard operation, reduced-motion behavior, store policies, and the Complete versus store-safe provider split.

**Acceptance criteria:**

- Every provider exposes queued, searching, found, no-match, rate-limited, authentication-required, blocked, unavailable, and cancelled states where applicable.
- Focus order, visible focus, status announcements, contrast, and 200% zoom pass a documented accessibility review.
- Reset, retry, provider-link, MangaBaka-link, and `Read Link` flows have browser-level regression tests.
- The redesigned popup is approved from rendered Chromium and Firefox screenshots at supported sizes.

## 2. Optional local-only MangaBaka inline integration

**Evidence — 2026-08-31 repository audit:** the v1.6 `document_start` content bridge sets compatibility markers and exchanges sanitized page context, but intentionally injects no visible controls; the popup remains the sole UI.

**Priority:** P3

**Problem:** Users must open the popup for every lookup or save action even while already on the relevant MangaBaka series page.

**Value:** An optional inline entry point could reduce repeated clicks while keeping the default experience unchanged.

**Approach:** Explore a locally configured, off-by-default inline button or status chip that calls the existing typed bridge. Prefer an official MangaBaka extension point or stable host element, isolate styling, and keep all lookup/result UI inside the extension unless the user explicitly enables the integration.

**Dependencies / policy constraints:** Requires MangaBaka's documented consent or a stable supported insertion point. It must not impersonate first-party UI, expose private library data, execute on unrelated routes, or be enabled in store packages without a separate policy review.

**Acceptance criteria:**

- The feature defaults to disabled and can be fully removed from the page without reload residue.
- Injection occurs only on validated MangaBaka series routes and never duplicates across client-side navigation.
- The control is keyboard accessible, visually distinguishable as extension UI, and uses only the existing sanitized bridge contract.
- Disabling or uninstalling the extension leaves no persisted page data or markup.

## 3. Full Comix support

**Evidence — 2026-08-31 repository audit:** `COMIX_ADAPTER` recognizes canonical Comix routes but is marked `planned`, returns `unsupported`, uses fixture-only testing, and remains disabled in the popup.

**Priority:** P1

**Problem:** Comix appears in settings and assets but cannot perform provider lookup or a complete provider-page-to-MangaBaka workflow.

**Value:** Completing it removes a visible placeholder and expands coverage to a provider already anticipated by the product.

**Approach:** Confirm current canonical routes and an acceptable first-party search contract, then implement search request construction, response parsing, page metadata extraction, canonicalization, and failure classification through the provider adapter interface.

**Dependencies / policy constraints:** Must comply with Comix access rules and rate limits. Do not introduce a general-purpose search-engine dependency or request a host permission until the adapter is functional and reviewed.

**Acceptance criteria:**

- Series and chapter URLs resolve to one canonical series identity with representative fixtures.
- Search returns ranked, deduplicated candidates and distinguishes no match from blocked, rate-limited, unavailable, and invalid responses.
- Provider-page MangaBaka search and MangaBaka-page provider lookup pass browser-level tests.
- Comix becomes selectable only in variants whose manifest grants its reviewed host permission.

## 4. MangaFire/WeebCentral chapter and language metadata

**Evidence — 2026-08-31 repository audit:** v1.6 replaces Yahoo-backed discovery with first-party MangaFire and WeebCentral adapters, but the shared provider result contract does not yet expose normalized latest-chapter or translation-language metadata for these providers.

**Priority:** P1

**Problem:** A matched URL alone does not tell users whether a provider has the chapter range or language they need, and differences between series and chapter pages can be ambiguous.

**Value:** Consistent chapter and language metadata would improve match confidence and make provider rows more useful without opening every result.

**Approach:** Define provider-neutral chapter/language fields, extract them only from stable first-party responses, normalize chapter labels and BCP 47 language tags, and treat missing metadata as unknown rather than no match.

**Dependencies / policy constraints:** Upstream markup may change and some providers may not publish reliable language data. Avoid inferring language from titles alone, and respect provider request limits.

**Acceptance criteria:**

- Representative MangaFire and WeebCentral fixtures cover series pages, chapter pages, absent metadata, malformed values, and multiple languages where supported.
- Chapter values use one documented normalization and retain the provider's display label when precision would be lost.
- Language values use validated tags or an explicit unknown state.
- Metadata failures never discard an otherwise valid canonical provider match.

## 5. Optional host permissions for disabled providers

**Evidence — 2026-08-31 manifest audit:** Google and Firefox packages remove adult hosts, but still request MangaFire and WeebCentral host access even though those providers default to disabled.

**Priority:** P1

**Problem:** The default install permission surface is broader than the enabled feature set.

**Value:** Optional permissions improve user trust, align access with explicit provider choices, and reduce store-review friction.

**Approach:** Keep only core MangaBaka and required update/API hosts at install time. Request a provider's origin through `optional_host_permissions` when the user enables it, explain why access is needed, and handle denial or later revocation as a typed provider state.

**Dependencies / policy constraints:** Browser permission UX differs between Chromium and Firefox. Permission requests must follow a user gesture and settings must not report a provider as enabled without its required origins.

**Acceptance criteria:**

- A fresh store install has no disabled-provider origin in mandatory `host_permissions`.
- Enabling, denying, revoking, and re-enabling each optional provider is covered in Chromium and Firefox tests.
- Provider state remains consistent after browser restart and permission removal.
- Package validation proves that unselected build variants contain only their declared optional and mandatory origins.

## 6. Authenticated ExHentai validation and retain/rewrite decision

**Evidence — 2026-08-31 provider audit:** ExHentai is Complete-only, sends credentials, classifies forbidden access as authentication-required, and is restricted to fixture-only live-test policy. No authorized authenticated end-to-end validation was performed.

**Priority:** P1

**Problem:** Cookie-dependent behavior, access restrictions, and upstream policy make reliability and safe maintenance uncertain.

**Value:** A documented retain, rewrite, or retire decision prevents users from relying on an unverified path and avoids unsafe automated testing.

**Approach:** Review ExHentai terms and browser cookie behavior, then conduct a user-authorized manual validation with a dedicated test account if policy permits. Record login-expired, forbidden, rate-limited, no-match, and successful cases without storing credentials or response content.

**Dependencies / policy constraints:** No automated authenticated traffic without explicit account authorization and policy review. Adult code, permissions, assets, and identifiers must remain absent from Google and Firefox store packages.

**Acceptance criteria:**

- A written decision records retain, rewrite, or retire with policy and reliability evidence.
- If retained, the Complete package distinguishes missing session, expired session, blocked access, rate limit, no match, and success without collecting credentials.
- Authenticated checks are manual or run only in an approved private environment with secrets excluded from logs and artifacts.
- Store package scans continue to prove complete adult-provider exclusion.

## 7. Provider-contract monitoring

**Evidence — 2026-08-31 test/CI audit:** provider behavior is covered by local fixtures and CI tests, but there is no scheduled contract-monitoring job for safe public endpoints or a maintained snapshot review process.

**Priority:** P1

**Problem:** Provider HTML and APIs can change between releases, leaving adapters broken until a user reports the regression.

**Value:** Early detection shortens outages and separates upstream contract drift from extension regressions.

**Approach:** Add a scheduled, low-frequency monitor only for adapters marked `safe_public`. Store minimal redacted contract facts, compare them with expected shapes, and open or report a maintenance alert without automatically rewriting fixtures.

**Dependencies / policy constraints:** Respect robots, terms, and rate limits. ExHentai and other `fixture_only` providers must never be contacted by the public monitor. Monitoring must not become user telemetry.

**Acceptance criteria:**

- Each monitored adapter documents endpoint, cadence, expected fields/selectors, request budget, and owner.
- Failures distinguish network outage, rate limit, block, invalid response, and genuine no-match.
- Repeated failures produce one actionable alert with redacted evidence and no page/account secrets.
- A policy allowlist prevents any `fixture_only` adapter from live scheduled execution.

## 8. Firefox AMO identity/signing automation

**Evidence — 2026-08-31 packaging audit:** Firefox packaging correctly emits Manifest V3 `background.scripts`, but the manifest has no finalized AMO identity and the release workflow creates an unsigned ZIP rather than submitting or signing it.

**Priority:** P2

**Problem:** Firefox releases still require manual identity, submission, signing, and listing work, increasing the chance of version or artifact mismatch.

**Value:** Guarded automation would make Firefox releases reproducible and provide a verifiable signed artifact.

**Approach:** Finalize the AMO add-on ID, add Firefox-specific manifest metadata declaratively, and create a release job that validates first, submits the exact Firefox package to AMO, waits for signing, and attaches the signed artifact without exposing credentials.

**Dependencies / policy constraints:** Requires an AMO account, stable add-on ID, listing approval, and repository secrets. Submission must remain approval-gated until dry runs and AMO policy review are complete.

**Acceptance criteria:**

- The Firefox manifest has the approved stable identity and passes AMO validation.
- Release version, Git tag, uploaded source archive, unsigned package, and signed artifact are cryptographically traceable to the same commit.
- Credentials are restricted to the release environment and never printed or included in artifacts.
- A failed validation or signing step cannot publish a partial GitHub release as successful.

## 9. Conditional-cache freshness and background lookup options

**Evidence — 2026-08-31 cache/runtime audit:** v1.6 introduces lookup cache schema v12 with validated API metadata, API update time, title fingerprints, and old-schema invalidation. Transient provider outcomes are deliberately not cached, and provider lookups remain popup-initiated.

**Priority:** P2

**Problem:** Fixed freshness behavior can either repeat unnecessary requests or leave stable results stale, while popup-only work stops when the popup closes.

**Value:** Conditional refresh and an explicit background option could make repeat use faster and longer lookups more reliable without persisting temporary failures.

**Approach:** Design provider-specific freshness rules using MangaBaka `last_updated`, title fingerprints, HTTP validators where available, and bounded TTLs. Separately prototype an off-by-default background lookup coordinator with cancellation, deduplication, and popup reconnection.

**Dependencies / policy constraints:** Must respect upstream caching/rate limits, browser service-worker suspension, optional host permissions, and user expectations about background traffic. Network, rate-limit, authentication, blocked, aborted, and malformed-response outcomes must remain transient.

**Acceptance criteria:**

- Cache documentation defines freshness inputs and maximum age for API metadata and every provider result class.
- Conditional requests fall back safely when an upstream validator is missing or invalid.
- Transient outcomes are never serialized into v12 or later persistent lookup records.
- Background lookup is disabled by default, visibly user-controlled, deduplicated per series, cancellable, and recoverable after worker suspension.
- Tests cover fresh, stale, title-changed, upstream-updated, offline, rate-limited, and popup-reconnect scenarios.

## Reserved for subsequent user feature requests

Future user-requested features should be appended here without silently changing the nine evidence-backed items above. Use this structure for each request:

### Request: _title to be supplied_

**Requested / evidence date:** _YYYY-MM-DD_

**Priority:** _P1, P2, or P3 after user confirmation_

**Problem:** _What the request is intended to solve._

**Value:** _Expected user or maintenance benefit._

**Approach:** _Proposed implementation direction._

**Dependencies / policy constraints:** _Required decisions, permissions, accounts, upstream contracts, or review gates._

**Acceptance criteria:** _Observable conditions that define completion._
