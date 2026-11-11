import { randomBytes } from "node:crypto";
import makeFetchCookie, { type FetchCookieImpl } from "fetch-cookie";
import { Cookie, CookieJar } from "tough-cookie";
import type { SecretStore } from "./secrets.js";
import { MOODLE_CREDENTIALS_KEY, moodleCredentialIdentity, moodleCredentials, type MoodleCredentialsShape } from "./moodle-session.js";
import { MoodleSessionExpiredError } from "./sources/moodle.js";

/** A connection changed while an old client was still reading. */
export class MoodleConnectionChangedError extends Error {
  readonly statusCode = 409;
  constructor() { super("Moodle 连接已更改，请重新读取数据。"); }
}

interface SessionContext {
  identity: string;
  epoch: number;
  credentials: MoodleCredentialsShape;
  jar: CookieJar;
  abort: AbortController;
  request: FetchCookieImpl<Parameters<typeof fetch>[0], RequestInit, Response>;
}
interface ContextFlight {
  identity: string;
  epoch: number;
  abort: AbortController;
  promise: Promise<SessionContext>;
}

/**
 * Muster's cookie-provider/session-UA design, adapted to Node with fetch-cookie
 * (MIT) and tough-cookie (BSD-3-Clause), without copying its Rust implementation.
 * One jar per connection, durable rotation, and one ordered credential write queue.
 */
export class MoodleSessionTransport {
  private epoch = 0;
  private closed = false;
  private active: ContextFlight | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: { secrets: SecretStore; fetcher: typeof fetch }) {}

  private invalidate(): void {
    this.epoch += 1;
    this.active?.abort.abort(new MoodleConnectionChangedError());
    this.active = null;
  }

  close(): void { this.closed = true; this.invalidate(); }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.then(work);
    this.writes = next.catch(() => undefined);
    return next;
  }

  /** Explicit login always starts a new scope, even for the same Moodle account. */
  replaceCredentials(value: string, signal?: AbortSignal): Promise<void> {
    const parsed = moodleCredentials.parse(JSON.parse(value));
    signal?.throwIfAborted();
    this.invalidate();
    return this.enqueue(async () => {
      if (this.closed) throw new MoodleConnectionChangedError();
      signal?.throwIfAborted();
      const previous = await this.options.secrets.get(MOODLE_CREDENTIALS_KEY);
      signal?.throwIfAborted();
      await this.options.secrets.set(MOODLE_CREDENTIALS_KEY, JSON.stringify({
        ...parsed, connectionId: randomBytes(32).toString("hex"),
      }));
      if (signal?.aborted) {
        // Keep rollback in this queue so it cannot overwrite a later login.
        if (previous === null) await this.options.secrets.delete(MOODLE_CREDENTIALS_KEY);
        else await this.options.secrets.set(MOODLE_CREDENTIALS_KEY, previous);
        signal.throwIfAborted();
      }
    });
  }

  deleteCredentials(): Promise<void> {
    this.invalidate();
    return this.enqueue(() => this.options.secrets.delete(MOODLE_CREDENTIALS_KEY));
  }

  private async assertCurrent(identity: string, epoch: number): Promise<string> {
    if (this.closed || epoch !== this.epoch) throw new MoodleConnectionChangedError();
    const raw = await this.options.secrets.get(MOODLE_CREDENTIALS_KEY);
    if (this.closed || epoch !== this.epoch || !raw || moodleCredentialIdentity(raw) !== identity) {
      throw new MoodleConnectionChangedError();
    }
    return raw;
  }

  private async createContext(raw: string, identity: string, epoch: number, abort: AbortController): Promise<SessionContext> {
    const credentials = moodleCredentials.parse(JSON.parse(raw));
    const base = new URL(credentials.baseUrl);
    const jar = credentials.cookieJar
      ? CookieJar.deserializeSync(JSON.stringify(credentials.cookieJar)) : new CookieJar();
    if (!credentials.cookieJar) {
      if (credentials.cookies?.length) {
        for (const source of credentials.cookies) {
          const domain = source.domain.replace(/^\./, "").toLowerCase();
          if (base.hostname !== domain && !base.hostname.endsWith(`.${domain}`)) continue;
          const cookie = new Cookie({
            key: source.name, value: source.value, domain, path: source.path,
            hostOnly: !source.domain.startsWith("."), secure: source.secure,
            httpOnly: source.httpOnly,
            expires: source.expires !== undefined && source.expires >= 0 ? new Date(source.expires * 1000) : "Infinity",
            sameSite: source.sameSite?.toLowerCase() as "strict" | "lax" | "none" | undefined,
          });
          await jar.setCookie(cookie, new URL(source.path, base).href);
        }
      } else {
        const header = credentials.cookie ?? `MoodleSession=${credentials.session}`;
        for (const pair of header.split(";")) {
          if (pair.trim()) await jar.setCookie(`${pair.trim()}; Path=/`, base.href);
        }
      }
    }
    const rawFetch: typeof fetch = async (input, init) => {
      await this.assertCurrent(identity, epoch);
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      // No cookie or authenticated request follows a bounce to an external IdP.
      if (target.origin !== base.origin) throw new MoodleSessionExpiredError();
      const headers = new Headers(init?.headers);
      if (credentials.userAgent) headers.set("user-agent", credentials.userAgent);
      const signal = AbortSignal.any([abort.signal, init?.signal ?? AbortSignal.timeout(30_000)]);
      const response = await this.options.fetcher(input, { ...init, headers, signal });
      await this.assertCurrent(identity, epoch);
      // Native fetch always has a URL; anonymous fixture Responses may omit it.
      if (!response.url) Object.defineProperty(response, "url", { value: target.href, configurable: true });
      return response;
    };
    const request = makeFetchCookie(rawFetch, jar);
    return { identity, epoch, credentials, jar, abort, request };
  }

  private async context(identity: string, epoch: number): Promise<SessionContext> {
    await this.writes;
    const raw = await this.assertCurrent(identity, epoch);
    if (!this.active || this.active.identity !== identity || this.active.epoch !== epoch) {
      const abort = new AbortController();
      const promise = this.createContext(raw, identity, epoch, abort);
      const flight = { identity, epoch, abort, promise };
      this.active = flight;
      void promise.catch(() => { if (this.active === flight) this.active = null; });
    }
    return this.active.promise;
  }

  private persist(context: SessionContext): Promise<void> {
    return this.enqueue(async () => {
      const raw = await this.assertCurrent(context.identity, context.epoch);
      const previous = moodleCredentials.parse(JSON.parse(raw));
      const dashboard = new URL("my/", `${previous.baseUrl.replace(/\/+$/, "")}/`).href;
      const cookies = await context.jar.getCookies(dashboard);
      const cookie = await context.jar.getCookieString(dashboard);
      const cookieJar = await context.jar.serialize();
      const next = JSON.stringify({
        ...previous, connectionId: context.identity, cookieJar,
        cookie: cookie || undefined,
        session: cookies.find((entry) => entry.key === "MoodleSession")?.value,
      });
      // Compare jar data rather than serialization timestamps: no keychain write on a simple ping.
      const oldCookies = previous.cookieJar?.cookies;
      if (oldCookies && JSON.stringify(oldCookies.map(({ lastAccessed: _at, ...entry }) => entry)) ===
          JSON.stringify(cookieJar.cookies.map(({ lastAccessed: _at, ...entry }) => entry))) return;
      await this.assertCurrent(context.identity, context.epoch);
      await this.options.secrets.set(MOODLE_CREDENTIALS_KEY, next);
      await this.assertCurrent(context.identity, context.epoch);
    });
  }

  /** Bind each logical reader to the connection that supplied its credentials. */
  forCredentials(raw: string): typeof fetch {
    const identity = moodleCredentialIdentity(raw);
    const epoch = this.epoch;
    return (async (input, init) => {
      const context = await this.context(identity, epoch);
      const request = input instanceof Request ? input : null;
      const headers = new Headers(init?.headers ?? request?.headers);
      headers.delete("cookie");
      const target = request?.url ?? input;
      const requestInit: RequestInit = request ? {
        method: request.method, body: request.body, signal: request.signal, ...init,
      } : { ...init };
      try {
        // A plain header record lets fetch-cookie replace (not append) cookies on redirects.
        const response = await context.request(target, { ...requestInit, headers: Object.fromEntries(headers), maxRedirect: 10 });
        await this.assertCurrent(identity, epoch);
        await this.persist(context);
        return response;
      } catch (error) {
        // Preserve any same-origin cookie rotation received before a failed redirect.
        if (error instanceof MoodleSessionExpiredError) await this.persist(context);
        throw error;
      }
    }) as typeof fetch;
  }
}
