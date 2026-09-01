import { getNativeLanguage, getRomanizedLanguage, MangaMediaType } from "./media";

export const DEFAULT_TITLE_LANGUAGE_PRIORITY = ["en", "_romanized", "_native"] as const;

export type VirtualTitleLanguage = "_native" | "_romanized";
export type TitleLanguagePriority = string | VirtualTitleLanguage;

export interface SeriesTitle {
  language: string;
  traits: readonly string[];
  title: string;
  note: string | null;
  isPrimary: boolean;
}

export interface ResolvedSeriesTitles {
  primaryTitle: string;
  orderedTitles: string[];
  primaryLanguage: string;
}

export interface ResolveSeriesTitleOptions {
  languagePriority?: readonly TitleLanguagePriority[];
  mediaType?: MangaMediaType;
}

interface IndexedTitle {
  title: SeriesTitle;
  index: number;
}

const TITLE_MARKS_PATTERN = /[\u0300-\u036f]/g;
const TITLE_SEPARATOR_PATTERN = /[^\p{L}\p{N}\s]/gu;

export function cleanTitleText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizeTitle(value: string): string {
  return cleanTitleText(value)
    .normalize("NFKD")
    .replace(TITLE_MARKS_PATTERN, "")
    .toLocaleLowerCase("und")
    .replace(TITLE_SEPARATOR_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeLanguage(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function matchesLanguagePriority(language: string, priority: string): boolean {
  const languageParts = normalizeLanguage(language).split("-").filter(Boolean);
  const priorityParts = normalizeLanguage(priority).split("-").filter(Boolean);
  return priorityParts.length > 0
    && priorityParts.length <= languageParts.length
    && priorityParts.every((part, index) => languageParts[index] === part);
}

function getTraitRank(title: SeriesTitle): number {
  if (title.isPrimary) {
    return 0;
  }
  if (title.traits.includes("official")) {
    return 1;
  }
  if (title.traits.includes("native")) {
    return 2;
  }
  if (title.traits.includes("alternative")) {
    return 3;
  }
  return 4;
}

function compareTitles(left: IndexedTitle, right: IndexedTitle): number {
  return getTraitRank(left.title) - getTraitRank(right.title) || left.index - right.index;
}

function addLanguage(languages: string[], seen: Set<string>, language: string | null): void {
  if (!language) {
    return;
  }

  const key = normalizeLanguage(language);
  if (!key || seen.has(key)) {
    return;
  }

  seen.add(key);
  languages.push(language);
}

export function expandTitleLanguagePriority(
  priority: readonly TitleLanguagePriority[],
  mediaType?: MangaMediaType,
): string[] {
  const languages: string[] = [];
  const seen = new Set<string>();

  for (const language of priority) {
    if (language === "_native") {
      if (mediaType) {
        addLanguage(languages, seen, getNativeLanguage(mediaType));
      } else {
        for (const fallback of ["ja", "ko", "zh", "en"]) {
          addLanguage(languages, seen, fallback);
        }
      }
      continue;
    }

    if (language === "_romanized") {
      if (mediaType) {
        addLanguage(languages, seen, getRomanizedLanguage(mediaType));
      } else {
        for (const fallback of ["ja-Latn", "ko-Latn", "zh-Latn"]) {
          addLanguage(languages, seen, fallback);
        }
      }
      continue;
    }

    addLanguage(languages, seen, language);
  }

  return languages;
}

export function resolveSeriesTitles(
  titles: readonly SeriesTitle[],
  options: ResolveSeriesTitleOptions = {},
): ResolvedSeriesTitles | null {
  const indexedTitles = titles
    .map((title, index): IndexedTitle | null => {
      const cleanedTitle = cleanTitleText(title.title);
      const language = title.language.trim();
      if (!cleanedTitle || !language) {
        return null;
      }

      return {
        index,
        title: {
          ...title,
          language,
          title: cleanedTitle,
        },
      };
    })
    .filter((entry): entry is IndexedTitle => entry !== null);

  if (indexedTitles.length === 0) {
    return null;
  }

  const titlesByLanguage = new Map<string, IndexedTitle[]>();
  const firstSeenLanguages: string[] = [];
  for (const candidate of indexedTitles) {
    const language = normalizeLanguage(candidate.title.language);
    const group = titlesByLanguage.get(language);
    if (group) {
      group.push(candidate);
    } else {
      titlesByLanguage.set(language, [candidate]);
      firstSeenLanguages.push(language);
    }
  }

  const expandedPriority = expandTitleLanguagePriority(
    options.languagePriority ?? DEFAULT_TITLE_LANGUAGE_PRIORITY,
    options.mediaType,
  );

  const orderedCandidates: IndexedTitle[] = [];
  const visitedLanguages = new Set<string>();
  for (const language of expandedPriority) {
    const matchingLanguageGroups = firstSeenLanguages.filter(
      (key) => !visitedLanguages.has(key) && matchesLanguagePriority(key, language),
    );
    if (matchingLanguageGroups.length === 0) {
      continue;
    }

    const groupedCandidates = matchingLanguageGroups.flatMap((key) => {
      visitedLanguages.add(key);
      return titlesByLanguage.get(key) ?? [];
    });
    orderedCandidates.push(...groupedCandidates.sort(compareTitles));
  }

  for (const language of firstSeenLanguages) {
    if (visitedLanguages.has(language)) {
      continue;
    }

    const group = titlesByLanguage.get(language);
    if (group) {
      orderedCandidates.push(...[...group].sort(compareTitles));
    }
  }

  const primary = orderedCandidates[0];
  if (!primary) {
    return null;
  }

  const seenTitles = new Set<string>();
  const orderedTitles: string[] = [];
  for (const candidate of orderedCandidates) {
    const key = normalizeTitle(candidate.title.title);
    if (!key || seenTitles.has(key)) {
      continue;
    }

    seenTitles.add(key);
    orderedTitles.push(candidate.title.title);
  }

  return {
    primaryTitle: primary.title.title,
    orderedTitles,
    primaryLanguage: primary.title.language,
  };
}

export function resolveDisplayTitle(
  resolved: ResolvedSeriesTitles,
  visibleHeading?: string | null,
): string {
  const heading = visibleHeading ? cleanTitleText(visibleHeading) : "";
  if (!heading) {
    return resolved.primaryTitle;
  }

  const headingKey = normalizeTitle(heading);
  return resolved.orderedTitles.find((title) => normalizeTitle(title) === headingKey) ?? resolved.primaryTitle;
}
