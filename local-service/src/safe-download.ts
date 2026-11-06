/**
 * Guards every outbound fetch that is driven by a URL from the client or from
 * scraped lesson HTML.
 *
 * The local service listens on 127.0.0.1 with no authentication, so an
 * unvalidated proxy endpoint is reachable from any web page on the machine.
 * Only Ed's own asset hosts are allowed, every redirect hop is re-validated,
 * and the response size is bounded.
 */

/** Hosts that Ed serves lesson attachments from. */
const ALLOWED_HOSTS = ["edusercontent.com", "edstem.org"] as const;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export class AssetFetchError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetFetchError";
  }
}

export interface AssetFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

export function assertAllowedAssetUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AssetFetchError(400, "invalid_url", "Resource URL is not a valid absolute URL.");
  }
  if (url.protocol !== "https:") {
    throw new AssetFetchError(400, "invalid_url", "Only https:// resource URLs can be downloaded.");
  }
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  if (!allowed) {
    throw new AssetFetchError(403, "blocked_host", `Refusing to fetch ${host}; only Ed asset hosts are allowed.`);
  }
  return url;
}

/**
 * Fetches an Ed asset, validating the initial URL and every redirect hop.
 * Redirects are followed manually so a redirect to an internal address cannot
 * turn this into an open proxy.
 */
export async function fetchAsset(fetcher: typeof fetch, rawUrl: string, options: AssetFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let current = assertAllowedAssetUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetcher(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AssetFetchError(502, "bad_redirect", "Resource redirected without a Location header.");
      }
      current = assertAllowedAssetUrl(new URL(location, current).toString());
      continue;
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new AssetFetchError(413, "too_large", "Resource is larger than the download limit.");
    }
    return response;
  }
  throw new AssetFetchError(502, "too_many_redirects", "Resource redirected too many times.");
}
