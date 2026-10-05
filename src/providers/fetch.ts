import type {
  ProviderCredentialPolicy,
  ProviderId,
  ProviderOutcome,
  ProviderSearchRequest,
} from "./types";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;

export interface ProviderHttpText {
  body: string;
  headers: Headers;
  status: number;
  url: string;
}

export interface ProviderFetchTextOptions {
  providerId: ProviderId;
  url: string;
  credentialPolicy: ProviderCredentialPolicy;
  forbiddenOutcome?: "blocked" | "auth_required";
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : undefined;
}

export async function fetchProviderText(options: ProviderFetchTextOptions): Promise<ProviderOutcome<ProviderHttpText>> {
  const fetchImpl = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = (): void => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetchImpl(options.url, {
      method: "GET",
      credentials: options.credentialPolicy,
      headers: options.headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const responseUrl = response.url || options.url;
    const base = {
      providerId: options.providerId,
      url: responseUrl,
      httpStatus: response.status,
    } as const;

    if (response.status === 401) {
      return { kind: "auth_required", ...base, message: "Provider authentication is required" };
    }

    if (response.status === 403) {
      return options.forbiddenOutcome === "auth_required"
        ? { kind: "auth_required", ...base, message: "Provider authentication or access is required" }
        : { kind: "blocked", ...base, message: "Provider blocked the automated request" };
    }

    if (response.status === 429) {
      return {
        kind: "rate_limited",
        ...base,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
        message: "Provider rate limit reached",
      };
    }

    if (response.status === 404) {
      return {
        kind: "unavailable",
        reason: "http",
        ...base,
        message: "Provider resource was not found",
      };
    }

    if (!response.ok) {
      return { kind: "unavailable", reason: "http", ...base, message: `Provider returned HTTP ${response.status}` };
    }

    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      if (timedOut || options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
      return { kind: "unavailable", reason: "network", ...base, message: "Provider response body could not be read" };
    }

    return {
      kind: "found",
      ...base,
      value: { body, headers: response.headers, status: response.status, url: responseUrl },
    };
  } catch (error) {
    if (timedOut) {
      return {
        kind: "unavailable",
        reason: "timeout",
        providerId: options.providerId,
        url: options.url,
        message: `Provider timed out after ${timeoutMs} ms`,
      };
    }

    if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return {
        kind: "unavailable",
        reason: "aborted",
        providerId: options.providerId,
        url: options.url,
        message: "Provider request was aborted",
      };
    }

    return {
      kind: "unavailable",
      reason: "network",
      providerId: options.providerId,
      url: options.url,
      message: "Provider request failed",
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function fetchProviderSearchRequest(
  providerId: ProviderId,
  request: ProviderSearchRequest,
  options: Pick<ProviderFetchTextOptions, "fetchImpl" | "signal" | "timeoutMs"> = {},
): Promise<ProviderOutcome<ProviderHttpText>> {
  return fetchProviderText({
    providerId,
    url: request.url,
    credentialPolicy: request.credentialPolicy,
    forbiddenOutcome: request.forbiddenOutcome,
    headers: request.headers,
    ...options,
  });
}
