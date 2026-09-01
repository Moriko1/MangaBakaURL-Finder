import { describe, expect, it } from "vitest";

import { summarizeProviderOutcomes } from "../src/popup/lookup-status";

describe("popup lookup outcome summary", () => {
  it("reports complete when every enabled provider has an authoritative outcome", () => {
    expect(summarizeProviderOutcomes(["atsu", "mangadex"], {
      atsu: { kind: "found", providerId: "atsu", value: { title: "match" } },
      mangadex: { kind: "no_match", providerId: "mangadex" },
    })).toBe("complete");
  });

  it("reports partial when stable results coexist with a transient failure", () => {
    expect(summarizeProviderOutcomes(["atsu", "mangadex"], {
      atsu: { kind: "found", providerId: "atsu", value: { title: "match" } },
      mangadex: { kind: "rate_limited", providerId: "mangadex" },
    })).toBe("partial");
  });

  it("reports unavailable when no enabled provider completed authoritatively", () => {
    expect(summarizeProviderOutcomes(["mangafire", "weebcentral"], {
      mangafire: { kind: "blocked", providerId: "mangafire" },
      weebcentral: { kind: "unavailable", providerId: "weebcentral", reason: "timeout" },
    })).toBe("unavailable");
  });
});
