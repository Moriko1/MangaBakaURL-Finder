import type { ProviderAdapter, ProviderOutcome, ProviderPageMatch } from "./types";
import { providerNoMatch, providerUnsupported } from "./types";
import { canonicalHttpsUrl, getPathSegments, parseHttpUrl } from "./url";

const COMIX_HOSTNAMES = new Set(["comix.to", "www.comix.to"]);

export function matchComixPage(value: string): ProviderPageMatch | null {
  const parsedUrl = parseHttpUrl(value);
  if (!parsedUrl || !COMIX_HOSTNAMES.has(parsedUrl.hostname.toLowerCase())) {
    return null;
  }
  const segments = getPathSegments(parsedUrl);
  if (segments[0]?.toLowerCase() !== "title" || segments.length < 2 || !segments[1].includes("-")) {
    return null;
  }
  const seriesToken = segments[1];
  const separator = seriesToken.indexOf("-");
  const shortId = seriesToken.slice(0, separator);
  if (!shortId) {
    return null;
  }
  return {
    providerId: "comixto",
    pageType: segments.length === 2 ? "series" : "chapter",
    sourceUrl: value,
    canonicalUrl: canonicalHttpsUrl("comix.to", segments),
    seriesId: shortId,
    chapterId: segments.length > 2 ? segments.slice(2).join("/") : null,
  };
}

export const COMIX_ADAPTER: ProviderAdapter = {
  id: "comixto",
  label: "Comix",
  availability: "planned",
  enabledByDefault: false,
  hostnames: ["comix.to", "www.comix.to"],
  homepageUrl: "https://comix.to/",
  credentialPolicy: "omit",
  liveTestPolicy: "fixture_only",
  matchPage(url: string): ProviderOutcome<ProviderPageMatch> {
    const match = matchComixPage(url);
    return match
      ? providerUnsupported("comixto", {
        url: match.canonicalUrl,
        message: "Comix route recognition is planned, but provider operations are not enabled",
      })
      : providerNoMatch("comixto", { url });
  },
};
