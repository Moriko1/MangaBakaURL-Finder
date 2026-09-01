import type { ProviderId } from "../providers/types";

export type BuildVariant = "complete" | "google" | "firefox";

export type ManifestBackgroundConfig =
  | { service_worker: string }
  | { scripts: readonly string[] };

/** Runtime contract implemented by scripts/variant-utils.mjs. */
export interface BuildVariantConfig {
  variant: BuildVariant;
  label: string;
  includeAdultProviders: boolean;
  includeLocalReleaseUpdates: boolean;
  includedProviders: readonly ProviderId[];
  hostPermissions: readonly string[];
  permissions: readonly string[];
  manifestBackground: ManifestBackgroundConfig;
  packagingRules: {
    includeAdultAssets: boolean;
    includeAdultMarkup: boolean;
    excludeAdultCode: boolean;
  };
}
