import type { ProviderId } from "./types";

type AdultProviderId = Extract<ProviderId, "ehentai" | "exhentai">;

function encodeSearchTitle(title: string): string {
  return encodeURIComponent(title.trim());
}

export function buildMangaBakaManualSearchUrl(title: string): string {
  return `https://mangabaka.org/search?q=${encodeSearchTitle(title)}`;
}

export function buildAtsumaruManualSearchUrl(title: string): string {
  return `https://atsu.moe/explore?search=${encodeSearchTitle(title)}`;
}

export function buildMangaDexManualSearchUrl(title: string): string {
  return `https://mangadex.org/search?q=${encodeSearchTitle(title)}`;
}

export function buildMangaFireManualSearchUrl(title: string): string {
  return `https://mangafire.to/filter?keyword=${encodeSearchTitle(title)}`;
}

export function buildWeebCentralManualSearchUrl(title: string): string {
  return `https://weebcentral.com/search?text=${encodeSearchTitle(title)}`;
}

export function buildAdultManualSearchUrl(providerId: AdultProviderId, title: string): string {
  const hostname = providerId === "exhentai" ? "exhentai.org" : "e-hentai.org";
  const searchParams = new URLSearchParams({ f_search: title.trim() });
  return `https://${hostname}/?${searchParams.toString()}`;
}
