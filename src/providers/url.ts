export function parseHttpUrl(value: string): URL | null {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:" ? parsedUrl : null;
  } catch {
    return null;
  }
}

export function getPathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponentSafely(segment));
}

export function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function canonicalHttpsUrl(hostname: string, segments: readonly string[], trailingSlash = false): string {
  const pathname = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return `https://${hostname}/${pathname}${trailingSlash ? "/" : ""}`;
}

export function slugToTitle(value: string, stripDotId = false): string {
  const withoutId = stripDotId ? value.replace(/\.[^.]+$/, "") : value;
  return decodeURIComponentSafely(withoutId).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    const identity = trimmed.normalize("NFKC").toLocaleLowerCase();
    if (!identity || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    deduped.push(trimmed);
  }

  return deduped;
}
