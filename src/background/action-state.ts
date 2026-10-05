export type SupportedActionSite =
  | "mangabaka"
  | "atsu"
  | "mangadex"
  | "mangafire"
  | "weebcentral"
  | "ehentai"
  | "exhentai";

declare const __ADULT_PROVIDERS_ENABLED__: boolean;

const CORE_SITE_BY_HOSTNAME = new Map<string, SupportedActionSite>([
  ["mangabaka.org", "mangabaka"],
  ["atsu.moe", "atsu"],
  ["mangadex.org", "mangadex"],
  ["mangafire.to", "mangafire"],
  ["weebcentral.com", "weebcentral"],
]);

const ADULT_SITE_BY_HOSTNAME = __ADULT_PROVIDERS_ENABLED__
  ? new Map<string, SupportedActionSite>([
      ["e-hentai.org", "ehentai"],
      ["exhentai.org", "exhentai"],
    ])
  : null;

export function getSupportedActionSite(value: string | undefined): SupportedActionSite | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }

    const hostname = url.hostname.replace(/^www\./u, "");
    return CORE_SITE_BY_HOSTNAME.get(hostname)
      ?? ADULT_SITE_BY_HOSTNAME?.get(hostname)
      ?? null;
  } catch {
    return null;
  }
}

export function isActionActiveForUrl(value: string | undefined): boolean {
  return getSupportedActionSite(value) !== null;
}
