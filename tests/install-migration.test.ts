import { describe, expect, it, vi } from "vitest";

import { runExtensionInstallMigrations } from "../src/background/install";
import type { LookupStorageArea } from "../src/lookup/cache";

function storageFixture(entries: Record<string, unknown>): LookupStorageArea {
  return {
    get: vi.fn(async () => ({ ...entries })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(entries, items); }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete entries[key];
    }),
  };
}

describe("extension update migration", () => {
  it("removes obsolete lookup caches during the update event", async () => {
    const entries = {
      "lookup:v11:377": { stale: true },
      "extension:settings": { providerLabelMode: "titles" },
      "extension:release-update": { status: "up_to_date" },
    };
    await expect(runExtensionInstallMigrations("update", storageFixture(entries)))
      .resolves.toEqual(["lookup:v11:377"]);
    expect(entries).not.toHaveProperty("lookup:v11:377");
    expect(entries).toHaveProperty("extension:settings");
    expect(entries).toHaveProperty("extension:release-update");
  });

  it("does not run upgrade cleanup for a fresh install", async () => {
    const storage = storageFixture({ "lookup:v11:377": { stale: true } });
    await expect(runExtensionInstallMigrations("install", storage)).resolves.toEqual([]);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
