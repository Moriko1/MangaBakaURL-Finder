export const MANGA_MEDIA_TYPES = ["manga", "manhwa", "manhua", "novel", "oel", "other"] as const;

export type MangaMediaType = (typeof MANGA_MEDIA_TYPES)[number];

export function isMangaMediaType(value: unknown): value is MangaMediaType {
  return typeof value === "string" && (MANGA_MEDIA_TYPES as readonly string[]).includes(value);
}

const NATIVE_LANGUAGE_BY_MEDIA_TYPE: Readonly<Record<MangaMediaType, string | null>> = {
  manga: "ja",
  manhwa: "ko",
  manhua: "zh",
  novel: "ja",
  oel: "en",
  other: null,
};

const ROMANIZED_LANGUAGE_BY_MEDIA_TYPE: Readonly<Record<MangaMediaType, string | null>> = {
  manga: "ja-Latn",
  manhwa: "ko-Latn",
  manhua: "zh-Latn",
  novel: "ja-Latn",
  oel: null,
  other: null,
};

export function getNativeLanguage(mediaType: MangaMediaType): string | null {
  return NATIVE_LANGUAGE_BY_MEDIA_TYPE[mediaType];
}

export function getRomanizedLanguage(mediaType: MangaMediaType): string | null {
  return ROMANIZED_LANGUAGE_BY_MEDIA_TYPE[mediaType];
}
