export interface ExtractedHtmlAnchor {
  href: string;
  text: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }

    return NAMED_ENTITIES[normalized] ?? _match;
  });
}

export function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

export function extractHtmlAnchors(html: string, baseUrl?: string): ExtractedHtmlAnchor[] {
  const anchors: ExtractedHtmlAnchor[] = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorPattern.exec(html)) !== null) {
    const attributes = anchorMatch[1] ?? "";
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawHref = decodeHtmlEntities(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
    if (!rawHref) {
      continue;
    }

    let href = rawHref;
    if (baseUrl) {
      try {
        href = new URL(rawHref, baseUrl).toString();
      } catch {
        continue;
      }
    }

    anchors.push({ href, text: htmlToText(anchorMatch[2] ?? "") });
  }

  return anchors;
}
