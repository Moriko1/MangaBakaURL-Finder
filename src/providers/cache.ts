import type { ProviderId, ProviderOutcome } from "./types";

export function resolveStableProviderOutcome<T>(
  providerId: ProviderId,
  liveOutcome: ProviderOutcome<T> | undefined,
  inferredResult: T | null,
): ProviderOutcome<T> | null {
  if (liveOutcome) {
    return liveOutcome.kind === "found"
      || liveOutcome.kind === "no_match"
      ? liveOutcome
      : null;
  }
  if (inferredResult) {
    return { kind: "found", providerId, value: inferredResult };
  }
  return null;
}
