import type { BrowserContext } from "playwright";
import { Cookie, CookieJar } from "tough-cookie";
import { parse } from "node-html-parser";
import { moodleCookieHeader, type MoodleCredentials } from "./moodle-download.js";
import { MoodleSessionExpiredError } from "./sources/moodle.js";

type BrowserCookie = Parameters<BrowserContext["addCookies"]>[0][number];

/** Project the current jar into browser cookies without broad Cookie headers. */
export function moodleBrowserCookies(credentials: MoodleCredentials): BrowserCookie[] {
  const base = new URL(credentials.baseUrl);
  let cookies: Cookie[];
  if (credentials.cookieJar) {
    const serialized = CookieJar.deserializeSync(JSON.stringify(credentials.cookieJar)).serializeSync();
    if (!serialized) throw new Error("Moodle cookie jar could not be read.");
    cookies = (serialized.cookies ?? [])
      .map((record) => Cookie.fromJSON(record)).filter((cookie): cookie is Cookie => cookie != null);
  } else if (credentials.cookies) {
    cookies = credentials.cookies.map((cookie) => new Cookie({
      key: cookie.name, value: cookie.value, domain: cookie.domain.replace(/^\./, ""),
      hostOnly: !cookie.domain.startsWith("."), path: cookie.path,
      secure: cookie.secure, httpOnly: cookie.httpOnly,
      expires: cookie.expires !== undefined && cookie.expires >= 0 ? new Date(cookie.expires * 1000) : "Infinity",
      sameSite: cookie.sameSite?.toLowerCase() as "strict" | "lax" | "none" | undefined,
    }));
  } else {
    const jar = new CookieJar();
    for (const pair of moodleCookieHeader(credentials).split(";")) {
      if (pair.trim()) jar.setCookieSync(`${pair.trim()}; Path=/${base.protocol === "https:" ? "; Secure" : ""}`, base.href);
    }
    cookies = jar.getCookiesSync(base.href);
  }
  return cookies.flatMap((cookie): BrowserCookie[] => {
    const domain = cookie.domain?.replace(/^\./, "").toLowerCase();
    const matchesHost = domain && (base.hostname === domain || !cookie.hostOnly && base.hostname.endsWith(`.${domain}`));
    const expiry = cookie.expiryTime() ?? Infinity;
    if (!cookie.key || !matchesHost || expiry <= Date.now()) return [];
    return [{
      name: cookie.key, value: cookie.value,
      domain: cookie.hostOnly ? domain : `.${domain}`, path: cookie.path ?? "/",
      secure: cookie.secure ?? false, httpOnly: cookie.httpOnly ?? false,
      ...(Number.isFinite(expiry) ? { expires: Math.floor(expiry / 1000) } : {}),
      ...(cookie.sameSite ? { sameSite: cookie.sameSite === "strict" ? "Strict" : cookie.sameSite === "lax" ? "Lax" : "None" } : {}),
    }];
  });
}

export function assertMoodleOrigin(baseUrl: string, target: string): void {
  if (new URL(target).origin !== new URL(baseUrl).origin) throw new Error("Target must be on the Moodle origin.");
}

/** Never return a screenshot of a login/SSO page as coursework evidence. */
export function assertMoodleBrowserPage(baseUrl: string, url: string, html: string): void {
  const target = new URL(url);
  if (target.origin !== new URL(baseUrl).origin || /\/(?:login|signin)(?:\/|\.php(?:\/|$)|$)/i.test(target.pathname)) {
    throw new MoodleSessionExpiredError();
  }
  const root = parse(html);
  if (root.querySelector('form input[type="password"], form#login, form#loginform, form[action*="/login/index.php"], body.notloggedin, body#page-login-index') ||
      /you are not logged in|您尚未登录|你尚未登录|您还未登录/i.test(root.querySelector('.logininfo')?.text ?? "")) {
    throw new MoodleSessionExpiredError();
  }
}
