import type { ProviderId, ProviderOutcome } from "../providers/types";

export type LookupOutcomeSummary = "complete" | "partial" | "unavailable";

export function summarizeProviderOutcomes(
  providerIds: readonly ProviderId[],
  outcomes: Partial<Record<ProviderId, ProviderOutcome<unknown>>>,
): LookupOutcomeSummary {
  let stableCount = 0;
  let transientCount = 0;

  for (const providerId of providerIds) {
    const outcome = outcomes[providerId];
    if (!outcome) {
      transientCount += 1;
    } else if (outcome.kind === "found" || outcome.kind === "no_match") {
      stableCount += 1;
    } else {
      transientCount += 1;
    }
  }

  if (transientCount === 0) {
    return "complete";
  }
  return stableCount > 0 ? "partial" : "unavailable";
}
