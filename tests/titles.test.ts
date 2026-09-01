import { describe, expect, it } from "vitest";

import {
  normalizeTitle,
  resolveDisplayTitle,
  resolveSeriesTitles,
  SeriesTitle,
} from "../src/domain/titles";

function title(
  language: string,
  value: string,
  traits: string[] = [],
  isPrimary = false,
): SeriesTitle {
  return { language, title: value, traits, isPrimary, note: null };
}

describe("resolveSeriesTitles", () => {
  it("ranks every title by language group and then by primary/trait rank", () => {
    const resolved = resolveSeriesTitles([
      title("ko", "Korean Primary", [], true),
      title("en", "English Alternative", ["alternative"]),
      title("fr", "French Primary", [], true),
      title("en", "English Official", ["official"]),
      title("ja-Latn", "Romanized Alternative", ["alternative"]),
      title("ja", "Native Official", ["official"]),
      title("en", "ENGLISH PRIMARY", [], true),
      title("ja-Latn", "ROMANIZED PRIMARY", [], true),
      title("ko", "Korean Alternative", ["alternative"]),
      title("ja", "NATIVE PRIMARY", [], true),
    ], { mediaType: "manga" });

    expect(resolved).toEqual({
      primaryTitle: "ENGLISH PRIMARY",
      primaryLanguage: "en",
      orderedTitles: [
        "ENGLISH PRIMARY",
        "English Official",
        "English Alternative",
        "ROMANIZED PRIMARY",
        "Romanized Alternative",
        "NATIVE PRIMARY",
        "Native Official",
        "Korean Primary",
        "Korean Alternative",
        "French Primary",
      ],
    });
  });

  it("keeps remaining language groups in first-seen order", () => {
    const resolved = resolveSeriesTitles([
      title("ms", "Malay Alternative", ["alternative"]),
      title("vi", "Vietnamese Primary", [], true),
      title("ms", "Malay Primary", [], true),
    ], { mediaType: "other" });

    expect(resolved?.orderedTitles).toEqual(["Malay Primary", "Malay Alternative", "Vietnamese Primary"]);
  });

  it.each([
    ["manga", "ja-Latn", "ja"],
    ["manhwa", "ko-Latn", "ko"],
    ["manhua", "zh-Latn", "zh"],
    ["novel", "ja-Latn", "ja"],
  ] as const)("uses the relevant romanized and native groups for %s", (mediaType, romanized, native) => {
    const resolved = resolveSeriesTitles([
      title(native, "Native"),
      title("fr", "Remaining"),
      title(romanized, "Romanized"),
      title("en", "English"),
    ], { mediaType });

    expect(resolved?.orderedTitles).toEqual(["English", "Romanized", "Native", "Remaining"]);
  });

  it("keeps OEL English-first without inventing a romanized or native group", () => {
    const resolved = resolveSeriesTitles([
      title("fr", "Remaining Primary", [], true),
      title("en-GB", "English Alternative", ["alternative"]),
      title("en-US", "ENGLISH PRIMARY", [], true),
      title("ko-Latn", "First remaining language"),
    ], { mediaType: "oel" });

    expect(resolved?.orderedTitles).toEqual([
      "ENGLISH PRIMARY",
      "English Alternative",
      "Remaining Primary",
      "First remaining language",
    ]);
  });

  it("matches BCP-47 language ranges case-insensitively and ranks traits across regional variants", () => {
    const resolved = resolveSeriesTitles([
      title("EN-gb", "English Alternative", ["alternative"]),
      title("ja-JP", "Native Regional", ["official"]),
      title("JA-lAtN-jp", "Romanized Regional", ["official"]),
      title("en-US", "English Primary", [], true),
    ], { mediaType: "manga" });

    expect(resolved?.orderedTitles).toEqual([
      "English Primary",
      "English Alternative",
      "Romanized Regional",
      "Native Regional",
    ]);
  });

  it("deduplicates punctuation/case variants without changing API spelling", () => {
    const resolved = resolveSeriesTitles([
      title("en", "ONE PIECE", ["official"], true),
      title("ja-Latn", "One Piece", ["native"], true),
      title("ja", "ワンピース", ["native"], true),
    ], { mediaType: "manga" });

    expect(resolved?.orderedTitles).toEqual(["ONE PIECE", "ワンピース"]);
    expect(normalizeTitle("One—Piece")).toBe(normalizeTitle("ONE PIECE"));
  });

  it("returns API spelling when a visible heading matches", () => {
    const resolved = resolveSeriesTitles([title("en", "ONE PIECE", ["official"], true)], { mediaType: "manga" });
    expect(resolved && resolveDisplayTitle(resolved, "One Piece")).toBe("ONE PIECE");
  });
});
