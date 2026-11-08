type FetchArgs = Parameters<typeof fetch>;

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Wraps a `fetch` implementation so every outbound request is cancellable.
 *
 * Without a timeout a stalled upstream (Gmail, Ed, Moodle) hangs the whole
 * sync loop and the HTTP handler that is waiting on it. A caller-supplied
 * signal wins, so shorter per-request limits still apply.
 */
export function withTimeout(fetcher: typeof fetch, timeoutMs = DEFAULT_TIMEOUT_MS): typeof fetch {
  return ((input: FetchArgs[0], init?: FetchArgs[1]) =>
    fetcher(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })) as typeof fetch;
}
