/**
 * Adapted from Muster PageFetcher, src-tauri/src/moodle/http.rs at ad237268.
 * Copyright 2026 Poetrynan. PolyForm Noncommercial 1.0.0.
 * License/provenance: ./vendor/muster/LICENSE and ./vendor/muster/NOTICE.
 * Scope is one logical read; durable parsed snapshots belong to resource-cache.ts.
 */
import { parse } from "node-html-parser";
import { MoodleSessionExpiredError } from "./sources/moodle.js";

export class MoodlePageReadError extends Error {
  constructor(readonly status: number) { super(`Moodle page returned HTTP ${status}.`); }
}

export interface MoodlePageReaderOptions {
  maxEntries?: number;
  maxRetainedBytes?: number;
  maxPageBytes?: number;
  timeoutMs?: number;
}
export interface MoodlePageReader {
  text(url: string | URL, init?: RequestInit): Promise<string>;
}

function withSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

async function boundedText(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Moodle page exceeds the size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("Moodle page exceeds the size limit.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export function createMoodlePageReader(fetcher: typeof fetch, options: MoodlePageReaderOptions = {}): MoodlePageReader {
  const limits = { maxEntries: 800, maxRetainedBytes: 96 * 1024 * 1024, maxPageBytes: 8 * 1024 * 1024, timeoutMs: 20_000, ...options };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Moodle page reader limits must be non-negative integers.");
  }
  const retained = new Map<string, { html: string; bytes: number }>();
  const inflight = new Map<string, Promise<string>>();
  let retainedBytes = 0;
  const connection = fetcher as typeof fetch & { assertCurrent?: () => Promise<void> };

  async function read(url: string, init: RequestInit): Promise<string> {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(limits.timeoutMs) });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) throw new MoodleSessionExpiredError();
      throw new MoodlePageReadError(response.status);
    }
    const landed = new URL(response.url || url);
    if (landed.origin !== new URL(url).origin || /\/(?:login|signin)(?:\/|\.php|$)/i.test(landed.pathname)) {
      await response.body?.cancel();
      throw new MoodleSessionExpiredError();
    }
    const html = await boundedText(response, limits.maxPageBytes);
    if (parse(html).querySelector('form input[type="password"], form#login, form#loginform, form[action*="/login/index.php"], body.notloggedin, body#page-login-index')) {
      throw new MoodleSessionExpiredError();
    }
    await connection.assertCurrent?.();
    return html;
  }

  return {
    async text(input: string | URL, init: RequestInit = {}): Promise<string> {
      init.signal?.throwIfAborted();
      if ((init.method ?? "GET").toUpperCase() !== "GET" || init.body) throw new TypeError("Moodle page reader only supports GET.");
      await connection.assertCurrent?.();
      init.signal?.throwIfAborted();
      const url = new URL(input).href;
      const headers = [...new Headers(init.headers)].sort(([a], [b]) => a.localeCompare(b));
      const key = JSON.stringify([url, headers, init.redirect, init.credentials, init.cache, init.mode, init.referrer, init.referrerPolicy, init.integrity]);
      const cached = retained.get(key);
      if (cached) {
        retained.delete(key); retained.set(key, cached);
        init.signal?.throwIfAborted();
        return cached.html;
      }
      let flight = inflight.get(key);
      if (!flight) {
        flight = read(url, init).then((html) => {
          const bytes = Buffer.byteLength(html);
          if (bytes <= limits.maxRetainedBytes && limits.maxEntries > 0) {
            retained.set(key, { html, bytes }); retainedBytes += bytes;
            while (retained.size > limits.maxEntries || retainedBytes > limits.maxRetainedBytes) {
              const oldest = retained.entries().next().value;
              if (!oldest) break;
              retained.delete(oldest[0]); retainedBytes -= oldest[1].bytes;
            }
          }
          return html;
        }).finally(() => { inflight.delete(key); });
        inflight.set(key, flight);
      }
      const html = await withSignal(flight, init.signal);
      await connection.assertCurrent?.();
      init.signal?.throwIfAborted();
      return html;
    },
  };
}
