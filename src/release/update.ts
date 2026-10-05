export const RELEASE_UPDATE_STORAGE_KEY = "extension:release-update";
export const RELEASE_UPDATE_ATTEMPT_KEY = "extension:release-update-attempt";
export const RELEASE_UPDATE_ALARM_NAME = "extension:release-update-check";

const GITHUB_RELEASES_LATEST_PAGE_URL = "https://github.com/Moriko1/MangaBakaURL-Finder/releases/latest";
const GITHUB_RELEASES_LATEST_API_URL = "https://api.github.com/repos/Moriko1/MangaBakaURL-Finder/releases/latest";
const DEFAULT_RELEASE_UPDATE_API_TIMEOUT_MS = 10_000;

export interface ReleaseUpdateRecord {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTagName: string | null;
  latestReleaseUrl: string;
  status: "up_to_date" | "update_available";
}

export interface ReleaseUpdateAttemptRecord {
  attemptedAt: string;
  currentVersion: string;
}

interface GitHubLatestReleaseResponse {
  tag_name?: string;
  html_url?: string;
}

interface LatestReleaseResolution {
  latestTagName: string | null;
  latestReleaseUrl: string;
}

interface ReleaseUpdateControllerOptions {
  currentVersion: string;
  versionName: string;
  storage: Pick<typeof chrome.storage.local, "get" | "set" | "remove">;
  alarms: Pick<typeof chrome.alarms, "clear" | "create">;
  tabs: Pick<typeof chrome.tabs, "create" | "get" | "query" | "remove" | "onRemoved" | "onUpdated">;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  apiTimeoutMs?: number;
}

export interface ReleaseUpdateController {
  ensureStatus(): Promise<void>;
  syncSchedule(forceCheck?: boolean): Promise<void>;
}

export function isLocalInstallSource(versionName: string): boolean {
  return !/\((Google|Firefox)\)$/i.test(versionName);
}

export function normalizeVersion(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^v?(\d+(?:\.\d+)*)/i);
  return match?.[1] ?? null;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

export function extractReleaseTagFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const tagIndex = segments.findIndex((segment) => segment === "tag");
    return tagIndex >= 0 && segments[tagIndex + 1] ? decodeURIComponent(segments[tagIndex + 1]) : null;
  } catch {
    return null;
  }
}

export function getLastScheduledReleaseUpdateTime(reference = new Date()): number {
  const scheduledTime = new Date(reference);
  scheduledTime.setHours(2, 0, 0, 0);
  if (reference.getTime() < scheduledTime.getTime()) {
    scheduledTime.setDate(scheduledTime.getDate() - 1);
  }
  return scheduledTime.getTime();
}

export function getNextScheduledReleaseUpdateTime(reference = new Date()): number {
  const scheduledTime = new Date(reference);
  scheduledTime.setHours(2, 0, 0, 0);
  if (reference.getTime() >= scheduledTime.getTime()) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  return scheduledTime.getTime();
}

export function isLatestReleaseCheckDue(
  currentVersion: string,
  record: ReleaseUpdateRecord | null,
  attemptRecord: ReleaseUpdateAttemptRecord | null,
  reference = new Date(),
): boolean {
  const lastScheduledTime = getLastScheduledReleaseUpdateTime(reference);
  if (record?.currentVersion === currentVersion) {
    const checkedAt = Date.parse(record.checkedAt);
    if (Number.isFinite(checkedAt) && checkedAt >= lastScheduledTime) {
      return false;
    }
  }

  if (!attemptRecord || attemptRecord.currentVersion !== currentVersion) {
    return true;
  }

  const attemptedAt = Date.parse(attemptRecord.attemptedAt);
  return !Number.isFinite(attemptedAt) || attemptedAt < lastScheduledTime;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isReleaseUpdateRecord(value: unknown): value is ReleaseUpdateRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.checkedAt === "string"
    && typeof record.currentVersion === "string"
    && typeof record.latestReleaseUrl === "string"
    && isNullableString(record.latestVersion)
    && isNullableString(record.latestTagName)
    && (record.status === "up_to_date" || record.status === "update_available")
  );
}

function isReleaseUpdateAttemptRecord(value: unknown): value is ReleaseUpdateAttemptRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.attemptedAt === "string" && typeof record.currentVersion === "string";
}

function isMissingTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id|Tabs cannot be edited right now|tab was closed/i.test(error.message);
}

export function createReleaseUpdateController(options: ReleaseUpdateControllerOptions): ReleaseUpdateController {
  const { alarms, currentVersion: manifestVersion, storage, tabs, versionName } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => new Date());
  const configuredApiTimeoutMs = options.apiTimeoutMs;
  const apiTimeoutMs = typeof configuredApiTimeoutMs === "number"
    && Number.isFinite(configuredApiTimeoutMs)
    && configuredApiTimeoutMs > 0
    ? configuredApiTimeoutMs
    : DEFAULT_RELEASE_UPDATE_API_TIMEOUT_MS;
  const currentVersion = normalizeVersion(manifestVersion) ?? manifestVersion;
  let syncPromise: Promise<void> | null = null;
  let pendingForcedSync = false;

  async function closeReleaseCheckTab(tabId: number): Promise<void> {
    try {
      await tabs.remove(tabId);
    } catch (error) {
      if (!isMissingTabError(error)) {
        console.warn("Failed to close the latest-release check tab.", error);
      }
    }
  }

  async function loadReleaseUpdateRecord(): Promise<ReleaseUpdateRecord | null> {
    const stored = await storage.get(RELEASE_UPDATE_STORAGE_KEY);
    return isReleaseUpdateRecord(stored[RELEASE_UPDATE_STORAGE_KEY]) ? stored[RELEASE_UPDATE_STORAGE_KEY] : null;
  }

  async function loadReleaseUpdateAttemptRecord(): Promise<ReleaseUpdateAttemptRecord | null> {
    const stored = await storage.get(RELEASE_UPDATE_ATTEMPT_KEY);
    return isReleaseUpdateAttemptRecord(stored[RELEASE_UPDATE_ATTEMPT_KEY]) ? stored[RELEASE_UPDATE_ATTEMPT_KEY] : null;
  }

  async function saveReleaseUpdateAttemptRecord(attemptedAt: string): Promise<void> {
    await storage.set({
      [RELEASE_UPDATE_ATTEMPT_KEY]: {
        attemptedAt,
        currentVersion,
      } satisfies ReleaseUpdateAttemptRecord,
    });
  }

  async function clearReleaseUpdateState(): Promise<void> {
    await alarms.clear(RELEASE_UPDATE_ALARM_NAME);
    await storage.remove([RELEASE_UPDATE_STORAGE_KEY, RELEASE_UPDATE_ATTEMPT_KEY]);
  }

  async function scheduleNextReleaseUpdateCheck(): Promise<void> {
    if (!isLocalInstallSource(versionName)) {
      await alarms.clear(RELEASE_UPDATE_ALARM_NAME);
      return;
    }

    await alarms.create(RELEASE_UPDATE_ALARM_NAME, {
      when: getNextScheduledReleaseUpdateTime(now()),
    });
  }

  async function shouldCheckLatestRelease(): Promise<boolean> {
    const [record, attemptRecord] = await Promise.all([
      loadReleaseUpdateRecord(),
      loadReleaseUpdateAttemptRecord(),
    ]);
    return isLatestReleaseCheckDue(currentVersion, record, attemptRecord, now());
  }

  async function fetchLatestReleaseFromApi(): Promise<LatestReleaseResolution> {
    const controller = new AbortController();
    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        controller.abort();
        reject(new Error(`GitHub latest release API request timed out after ${apiTimeoutMs} ms.`));
      }, apiTimeoutMs);
    });
    const request = (async (): Promise<LatestReleaseResolution> => {
      const response = await fetchImpl(GITHUB_RELEASES_LATEST_API_URL, {
        headers: {
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub latest release request failed with status ${response.status}.`);
      }

      const payload = await response.json() as GitHubLatestReleaseResponse;
      return {
        latestTagName: typeof payload.tag_name === "string" && payload.tag_name.trim() ? payload.tag_name.trim() : null,
        latestReleaseUrl: typeof payload.html_url === "string" && payload.html_url.trim()
          ? payload.html_url.trim()
          : GITHUB_RELEASES_LATEST_PAGE_URL,
      };
    })();

    try {
      return await Promise.race([request, timeout]);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  async function waitForTabToFinishLoading(tabId: number, timeoutMs = 15000): Promise<{ url?: string; status?: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while resolving the latest GitHub release URL."));
      }, timeoutMs);

      const cleanup = (): void => {
        globalThis.clearTimeout(timeoutId);
        tabs.onUpdated.removeListener(handleUpdated);
        tabs.onRemoved.removeListener(handleRemoved);
      };

      const handleUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") {
          return;
        }
        void resolveCurrentTab();
      };

      const handleRemoved = (removedTabId: number): void => {
        if (removedTabId !== tabId) {
          return;
        }
        cleanup();
        reject(new Error("The latest-release check tab was closed before it finished loading."));
      };

      const resolveCurrentTab = async (): Promise<void> => {
        try {
          const tab = await tabs.get(tabId);
          if (tab.status !== "complete") {
            return;
          }
          cleanup();
          resolve(tab);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      tabs.onUpdated.addListener(handleUpdated);
      tabs.onRemoved.addListener(handleRemoved);
      void resolveCurrentTab();
    });
  }

  async function resolveLatestReleaseViaTab(): Promise<LatestReleaseResolution> {
    const existingTabs = await tabs.query({});
    const hostTab = existingTabs.find((tab) => typeof tab.windowId === "number");
    if (!hostTab || typeof hostTab.windowId !== "number") {
      throw new Error("No browser window is available to resolve the latest GitHub release.");
    }

    const releaseTab = await tabs.create({
      url: GITHUB_RELEASES_LATEST_PAGE_URL,
      active: false,
      windowId: hostTab.windowId,
    });
    const releaseTabId = typeof releaseTab.id === "number" ? releaseTab.id : null;
    if (releaseTabId == null) {
      throw new Error("Unable to create the latest-release check tab.");
    }

    try {
      const resolvedTab = await waitForTabToFinishLoading(releaseTabId);
      const latestReleaseUrl = resolvedTab.url ?? GITHUB_RELEASES_LATEST_PAGE_URL;
      const latestTagName = extractReleaseTagFromUrl(latestReleaseUrl);
      if (!latestTagName) {
        throw new Error(`GitHub did not resolve the latest release to a tag URL: ${latestReleaseUrl}`);
      }
      return { latestTagName, latestReleaseUrl };
    } finally {
      await closeReleaseCheckTab(releaseTabId);
    }
  }

  async function fetchAndStoreLatestReleaseUpdate(checkedAt: string): Promise<void> {
    let latestRelease: LatestReleaseResolution | null = null;
    try {
      latestRelease = await fetchLatestReleaseFromApi();
    } catch {
      // Resolve via one bounded tab attempt if the API is unavailable.
    }
    if (!latestRelease?.latestTagName) {
      latestRelease = await resolveLatestReleaseViaTab();
    }

    const latestVersion = normalizeVersion(latestRelease.latestTagName);
    const record: ReleaseUpdateRecord = {
      checkedAt,
      currentVersion,
      latestVersion,
      latestTagName: latestRelease.latestTagName,
      latestReleaseUrl: latestRelease.latestReleaseUrl,
      status: latestVersion != null && compareVersions(currentVersion, latestVersion) < 0
        ? "update_available"
        : "up_to_date",
    };

    await storage.set({ [RELEASE_UPDATE_STORAGE_KEY]: record });
  }

  async function syncSchedule(forceCheck = false): Promise<void> {
    pendingForcedSync = pendingForcedSync || forceCheck;
    if (syncPromise) {
      return syncPromise;
    }

    const drainPromise = (async () => {
      do {
        const runForceCheck = pendingForcedSync;
        pendingForcedSync = false;

        if (!isLocalInstallSource(versionName)) {
          await clearReleaseUpdateState();
          return;
        }

        await scheduleNextReleaseUpdateCheck();
        if (runForceCheck || (await shouldCheckLatestRelease())) {
          const attemptedAt = now().toISOString();
          await saveReleaseUpdateAttemptRecord(attemptedAt);
          try {
            await fetchAndStoreLatestReleaseUpdate(attemptedAt);
          } catch (error) {
            console.warn("Failed to check the latest GitHub release.", error);
          }
        }

        await scheduleNextReleaseUpdateCheck();
      } while (pendingForcedSync);
    })();
    syncPromise = drainPromise.finally(async () => {
      syncPromise = null;
      if (pendingForcedSync) {
        await syncSchedule();
      }
    });

    return syncPromise;
  }

  async function ensureStatus(): Promise<void> {
    if (!isLocalInstallSource(versionName)) {
      await clearReleaseUpdateState();
      return;
    }

    // The scheduler also considers failed attempts, including before the first
    // successful check. Opening the popup must not bypass that retry boundary.
    await syncSchedule();
  }

  return { ensureStatus, syncSchedule };
}
