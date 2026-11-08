import { describe, expect, it, vi } from "vitest";
import { MoodleClient } from "../sources/moodle.js";
import { moodleCookieHeader } from "../moodle-download.js";

function responseWithUrl(body: string, url: string, status = 200) {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("moodle session probing", () => {
  it("accepts a dashboard response served from the Moodle host", async () => {
    const fetcher = vi.fn(async () => responseWithUrl("<html>dashboard</html>", "https://learning.monash.edu/my/")) as unknown as typeof fetch;
    const client = new MoodleClient("https://learning.monash.edu", "MoodleSession=abc", fetcher);
    await expect(client.probeSession()).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("rejects an SSO bounce even when it returns 200", async () => {
    const fetcher = vi.fn(async () => responseWithUrl("<html>okta</html>", "https://monashuni.okta.com/app/x/sso/saml")) as unknown as typeof fetch;
    const client = new MoodleClient("https://learning.monash.edu", "MoodleSession=abc", fetcher);
    await expect(client.validateSession()).resolves.toBe(false);
  });

  it("sends the captured cookie jar verbatim", async () => {
    const seen: string[] = [];
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>).cookie));
      return responseWithUrl("<html>dashboard</html>", "https://learning.monash.edu/my/");
    }) as unknown as typeof fetch;
    const jar = "MoodleSession=abc; MDL_SSP_SessID=def";
    await new MoodleClient("https://learning.monash.edu", jar, fetcher).validateSession();
    expect(seen[0]).toBe(jar);
  });
});

describe("moodle credential shapes", () => {
  it("prefers the captured cookie header", () => {
    expect(moodleCookieHeader({ session: "abc", cookie: "MoodleSession=abc; MDL_SSP_SessID=def" })).toBe("MoodleSession=abc; MDL_SSP_SessID=def");
  });

  it("falls back to a pasted session value", () => {
    expect(moodleCookieHeader({ session: "abc" })).toBe("MoodleSession=abc");
  });

  it("fails loudly when neither is stored", () => {
    expect(() => moodleCookieHeader({})).toThrow(/missing both/);
  });
});
