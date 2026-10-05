import { normalizeTitle } from "../domain/titles";
import type { ProviderSearchCandidate } from "./types";

const MIN_COMPACT_TITLE_LENGTH = 12;

interface CandidateMatch {
  candidate: ProviderSearchCandidate;
  exact: boolean;
  aliasCount: number;
}

function compactTitle(title: string): string | null {
  const compact = title.replace(/\s+/gu, "");
  return Array.from(compact).length >= MIN_COMPACT_TITLE_LENGTH ? compact : null;
}

function compareMatches(left: CandidateMatch, right: CandidateMatch): number {
  return Number(left.exact) - Number(right.exact) || left.aliasCount - right.aliasCount;
}

/** Prefer full title identities and leave equally supported series for manual selection. */
export function pickMangaDexSearchCandidate(
  candidates: readonly ProviderSearchCandidate[],
  sourceTitles: readonly string[],
  rejectedUrls: readonly string[] = [],
): ProviderSearchCandidate | null {
  const normalizedSources = [...new Set(sourceTitles.map(normalizeTitle).filter(Boolean))];
  const rejectedUrlSet = new Set(rejectedUrls);
  let best: CandidateMatch | null = null;
  let ambiguous = false;

  for (const candidate of candidates) {
    if (candidate.providerId !== "mangadex" || rejectedUrlSet.has(candidate.url)) {
      continue;
    }

    const normalizedAliases = new Set(
      [candidate.title, ...candidate.aliases].map(normalizeTitle).filter(Boolean),
    );
    const compactAliases = new Set(
      [...normalizedAliases].map(compactTitle).filter((title): title is string => title !== null),
    );
    const matchingAliases = new Set<string>();
    let exact = false;
    for (const source of normalizedSources) {
      const compact = compactTitle(source);
      const isExact = normalizedAliases.has(source);
      if (isExact || (compact !== null && compactAliases.has(compact))) {
        exact ||= isExact;
        // Spacing variants of the same alias must not inflate the evidence count.
        matchingAliases.add(compact ?? source);
      }
    }

    if (matchingAliases.size === 0) {
      continue;
    }
    const match = { candidate, exact, aliasCount: matchingAliases.size };
    const comparison = best === null ? 1 : compareMatches(match, best);
    if (comparison > 0) {
      best = match;
      ambiguous = false;
    } else if (comparison === 0 && best !== null) {
      const sameSeries = candidate.seriesId !== null && candidate.seriesId === best.candidate.seriesId;
      if (!sameSeries && candidate.url !== best.candidate.url) {
        ambiguous = true;
      }
    }
  }

  return best !== null && !ambiguous ? best.candidate : null;
}
