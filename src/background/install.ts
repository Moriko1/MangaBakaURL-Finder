import { migrateLookupCacheStorage, type LookupStorageArea } from "../lookup/cache";

export async function runExtensionInstallMigrations(
  reason: chrome.runtime.InstalledDetails["reason"],
  storage: LookupStorageArea,
): Promise<string[]> {
  return reason === "update" ? migrateLookupCacheStorage(storage) : [];
}
