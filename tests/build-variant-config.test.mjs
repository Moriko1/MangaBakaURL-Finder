import { describe, expect, it } from "vitest";

import {
  createVariantManifest,
  getVariantConfig,
  getVariantHostPermissions,
} from "../scripts/variant-utils.mjs";

const baseManifest = JSON.stringify({ version: "1.6.0", host_permissions: [], background: {} });

describe("BuildVariantConfig", () => {
  it("keeps adult providers, permissions, assets, and markup complete-build-only", () => {
    const complete = getVariantConfig("complete");
    const google = getVariantConfig("google");
    const firefox = getVariantConfig("firefox");

    expect(complete.includedProviders).toEqual(expect.arrayContaining(["ehentai", "exhentai"]));
    expect(complete.includeLocalReleaseUpdates).toBe(true);
    expect(complete.permissions).toContain("alarms");
    expect(complete.hostPermissions).toContain("https://api.github.com/*");
    expect(complete.packagingRules).toEqual({
      excludeAdultCode: false,
      includeAdultAssets: true,
      includeAdultMarkup: true,
    });
    for (const config of [google, firefox]) {
      expect(config.includedProviders).not.toEqual(expect.arrayContaining(["ehentai", "exhentai"]));
      expect(config.hostPermissions.join(" ")).not.toMatch(/e-hentai|exhentai/);
      expect(config.includeLocalReleaseUpdates).toBe(false);
      expect(config.permissions).not.toContain("alarms");
      expect(config.hostPermissions).not.toContain("https://api.github.com/*");
      expect(config.packagingRules).toEqual({
        excludeAdultCode: true,
        includeAdultAssets: false,
        includeAdultMarkup: false,
      });
    }
    expect(getVariantHostPermissions("complete")).toEqual(complete.hostPermissions);
  });

  it("drives the manifest background form from the variant contract", () => {
    const complete = JSON.parse(createVariantManifest("complete", baseManifest));
    const firefox = JSON.parse(createVariantManifest("firefox", baseManifest));

    expect(complete.background).toEqual({ service_worker: "dist/background.js" });
    expect(firefox.background).toEqual({ scripts: ["dist/background.js"] });
  });
});
