import { describe, expect, it } from "vitest";

import {
  compareVersions,
  extractReleaseTagFromUrl,
  getLastScheduledReleaseUpdateTime,
  getNextScheduledReleaseUpdateTime,
  isLatestReleaseCheckDue,
  isLocalInstallSource,
  normalizeVersion,
  type ReleaseUpdateAttemptRecord,
  type ReleaseUpdateRecord,
} from "../src/release/update";

function releaseRecord(checkedAt: Date, currentVersion = "1.6.0"): ReleaseUpdateRecord {
  return {
    checkedAt: checkedAt.toISOString(),
    currentVersion,
    latestVersion: "1.6.0",
    latestTagName: "v1.6.0",
    latestReleaseUrl: "https://github.com/Moriko1/MangaBakaURL-Finder/releases/tag/v1.6.0",
    status: "up_to_date",
  };
}

function attemptRecord(attemptedAt: Date, currentVersion = "1.6.0"): ReleaseUpdateAttemptRecord {
  return { attemptedAt: attemptedAt.toISOString(), currentVersion };
}

describe("release version helpers", () => {
  it("normalizes release tags while rejecting non-version values", () => {
    expect(normalizeVersion(" v1.6.0 ")).toBe("1.6.0");
    expect(normalizeVersion("1.6.0-beta.1")).toBe("1.6.0");
    expect(normalizeVersion("release-1.6.0")).toBeNull();
    expect(normalizeVersion(undefined)).toBeNull();
  });

  it("compares numeric segments and treats omitted segments as zero", () => {
    expect(compareVersions("1.6", "1.6.0")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.12")).toBeGreaterThan(0);
    expect(compareVersions("1.6.0", "2.0.0")).toBeLessThan(0);
  });

  it("extracts an encoded tag from a GitHub release URL", () => {
    expect(extractReleaseTagFromUrl("https://github.com/example/project/releases/tag/v1.6.0%2Bdev"))
      .toBe("v1.6.0+dev");
    expect(extractReleaseTagFromUrl("https://github.com/example/project/releases/latest")).toBeNull();
    expect(extractReleaseTagFromUrl("not a URL")).toBeNull();
  });

  it("limits self-update checks to local builds", () => {
    expect(isLocalInstallSource("1.6.0")).toBe(true);
    expect(isLocalInstallSource("1.6.0 (Google)")).toBe(false);
    expect(isLocalInstallSource("1.6.0 (Firefox)")).toBe(false);
  });
});

describe("release scheduling helpers", () => {
  it("uses the previous 2 AM boundary before 2 AM", () => {
    const reference = new Date(2026, 7, 31, 1, 30, 0, 0);
    const last = new Date(getLastScheduledReleaseUpdateTime(reference));
    const next = new Date(getNextScheduledReleaseUpdateTime(reference));

    expect([last.getFullYear(), last.getMonth(), last.getDate(), last.getHours()])
      .toEqual([2026, 7, 30, 2]);
    expect([next.getFullYear(), next.getMonth(), next.getDate(), next.getHours()])
      .toEqual([2026, 7, 31, 2]);
  });

  it("uses today's and tomorrow's 2 AM boundaries at exactly 2 AM", () => {
    const reference = new Date(2026, 7, 31, 2, 0, 0, 0);
    const last = new Date(getLastScheduledReleaseUpdateTime(reference));
    const next = new Date(getNextScheduledReleaseUpdateTime(reference));

    expect([last.getDate(), last.getHours(), last.getMinutes()]).toEqual([31, 2, 0]);
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([1, 2, 0]);
  });

  it("does not recheck after a current-version success past the latest boundary", () => {
    const reference = new Date(2026, 7, 31, 12, 0, 0, 0);
    const checkedAt = new Date(2026, 7, 31, 2, 0, 0, 0);
    expect(isLatestReleaseCheckDue("1.6.0", releaseRecord(checkedAt), null, reference)).toBe(false);
  });

  it("uses the attempt record to suppress repeated failures until the next boundary", () => {
    const reference = new Date(2026, 7, 31, 12, 0, 0, 0);
    const attemptedAt = new Date(2026, 7, 31, 3, 0, 0, 0);
    expect(isLatestReleaseCheckDue("1.6.0", null, attemptRecord(attemptedAt), reference)).toBe(false);
  });

  it("checks again for stale records or a different installed version", () => {
    const reference = new Date(2026, 7, 31, 12, 0, 0, 0);
    const stale = new Date(2026, 7, 30, 3, 0, 0, 0);
    expect(isLatestReleaseCheckDue("1.6.0", releaseRecord(stale), null, reference)).toBe(true);
    expect(isLatestReleaseCheckDue("1.6.0", null, attemptRecord(reference, "1.5.2"), reference)).toBe(true);
  });
});
