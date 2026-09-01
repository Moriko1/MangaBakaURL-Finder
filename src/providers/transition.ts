import type { ProviderOutcome } from "./types";

export interface ProviderSearchState<T> {
  result: T | null;
  searched: boolean;
  titleCursor: number;
}

export interface ProviderSearchTransition<T> extends ProviderSearchState<T> {
  commit: boolean;
}

export function transitionProviderSearch<T>(
  previous: ProviderSearchState<T>,
  attemptedTitleCursor: number,
  outcome: ProviderOutcome<T>,
): ProviderSearchTransition<T> {
  if (outcome.kind === "found") {
    return {
      commit: true,
      result: outcome.value,
      searched: true,
      titleCursor: attemptedTitleCursor,
    };
  }
  if (outcome.kind === "no_match") {
    return {
      commit: true,
      result: null,
      searched: true,
      titleCursor: attemptedTitleCursor,
    };
  }
  return { commit: false, ...previous };
}

export function isStableProviderSearchOutcome<T>(outcome: ProviderOutcome<T>): boolean {
  return outcome.kind === "found" || outcome.kind === "no_match";
}
