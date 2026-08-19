import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  asUrlId,
  generatePkcePair,
  generateState,
  SessionExpiredError,
  Spoo,
} from "../src/index.js";
import { base64url } from "../src/core/pkce.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function client() {
  return new Spoo({ baseUrl: BASE });
}

/** Build an unsigned JWT with the given payload, enough for exp parsing. */
function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(obj)));
  return `${enc({ alg: "none" })}.${enc(payload)}.sig`;
}

test("pkce pair matches RFC 7636: 43-char base64url verifier, S256 challenge", async () => {
  const pair = await generatePkcePair();
  expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
  expect(pair.challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  // Independent recomputation of the challenge
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pair.verifier),
  );
  expect(pair.challenge).toBe(base64url(new Uint8Array(digest)));
  // Two pairs never collide
  expect((await generatePkcePair()).verifier).not.toBe(pair.verifier);
});

test("pkce challenge reproduces the RFC 7636 appendix B vector", async () => {
  // Appendix B fixes the verifier and expects this exact challenge.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  expect(base64url(new Uint8Array(digest))).toBe(
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("authorizationUrl carries all params and mandates S256", () => {
  const url = new URL(
    client().oauth.authorizationUrl({
      appId: "raycast",
      redirectUri: "https://raycast.com/redirect?package=spoo",
      state: "st4te",
      codeChallenge: "ch4llenge",
    }),
  );
  expect(url.origin + url.pathname).toBe(`${BASE}/auth/device/login`);
  expect(url.searchParams.get("app_id")).toBe("raycast");
  expect(url.searchParams.get("redirect_uri")).toBe("https://raycast.com/redirect?package=spoo");
  expect(url.searchParams.get("state")).toBe("st4te");
  expect(url.searchParams.get("code_challenge")).toBe("ch4llenge");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
});

test("generateState is url-safe and unique", () => {
  const a = generateState();
  expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
  expect(generateState()).not.toBe(a);
});

test("exchangeCode posts code and verifier with no auth header", async () => {
  let body: unknown;
  let auth: string | null = "unset";
  server.use(
    http.post(`${BASE}/auth/device/token`, async ({ request }) => {
      body = await request.json();
      auth = request.headers.get("authorization");
      return HttpResponse.json({
        access_token: fakeJwt({ exp: 9999999999 }),
        refresh_token: "r1",
        user: { id: "u1", email: "e@x.com", email_verified: true },
      });
    }),
  );
  const tokens = await client().oauth.exchangeCode({ code: "c0de", codeVerifier: "v3rifier" });
  expect(body).toEqual({ code: "c0de", code_verifier: "v3rifier" });
  expect(auth).toBeNull();
  expect(tokens.refresh_token).toBe("r1");
  expect(tokens.user.id).toBe("u1");
});

test("refreshTokens maps a rejected refresh token to SessionExpiredError", async () => {
  server.use(
    http.post(`${BASE}/auth/device/refresh`, () =>
      HttpResponse.json(
        { error: "Invalid refresh token", code: "authentication_error" },
        { status: 401 },
      ),
    ),
  );
  const err = await client()
    .oauth.refreshTokens("dead")
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(SessionExpiredError);
});

test("tokenProvider returns the access token while it is fresh", async () => {
  const access = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const provider = client().oauth.tokenProvider({
    tokens: { access_token: access, refresh_token: "r1" },
  });
  expect(await provider()).toBe(access);
});

test("tokenProvider refreshes near expiry, rotates, and reports via onRefresh", async () => {
  const stale = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 5 }); // inside 30s skew
  const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  let refreshCalls = 0;
  let sentRefreshToken: unknown;
  server.use(
    http.post(`${BASE}/auth/device/refresh`, async ({ request }) => {
      refreshCalls += 1;
      sentRefreshToken = ((await request.json()) as { refresh_token: string }).refresh_token;
      return HttpResponse.json({ access_token: fresh, refresh_token: "r2" });
    }),
  );
  const persisted: string[] = [];
  const provider = client().oauth.tokenProvider({
    tokens: { access_token: stale, refresh_token: "r1" },
    onRefresh: (t) => {
      persisted.push(t.refresh_token);
    },
  });

  // Concurrent callers share one refresh (single-flight)
  const [a, b, c] = await Promise.all([provider(), provider(), provider()]);
  expect(refreshCalls).toBe(1);
  expect(sentRefreshToken).toBe("r1");
  expect(a).toBe(fresh);
  expect(b).toBe(fresh);
  expect(c).toBe(fresh);
  expect(persisted).toEqual(["r2"]);

  // Fresh token now short-circuits, no further refresh
  expect(await provider()).toBe(fresh);
  expect(refreshCalls).toBe(1);
});

test("tokenProvider surfaces SessionExpiredError and can retry after failure", async () => {
  const stale = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
  let calls = 0;
  server.use(
    http.post(`${BASE}/auth/device/refresh`, () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { error: "Invalid refresh token", code: "authentication_error" },
          { status: 401 },
        );
      }
      return HttpResponse.json({
        access_token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        refresh_token: "r2",
      });
    }),
  );
  const provider = client().oauth.tokenProvider({
    tokens: { access_token: stale, refresh_token: "r1" },
  });
  await expect(provider()).rejects.toBeInstanceOf(SessionExpiredError);
  // The failed flight is not cached: a later call refreshes again.
  await expect(provider()).resolves.toMatch(/\./);
  expect(calls).toBe(2);
});

test("the provider plugs into Spoo and authenticates requests", async () => {
  const access = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  let seenAuth: string | null = null;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, ({ request }) => {
      seenAuth = request.headers.get("authorization");
      return HttpResponse.json({ id: "0".repeat(24), password_set: false });
    }),
  );
  const provider = client().oauth.tokenProvider({
    tokens: { access_token: access, refresh_token: "r1" },
  });
  const spoo = new Spoo({ baseUrl: BASE, token: provider });
  await spoo.links.get(asUrlId("0".repeat(24)));
  expect(seenAuth).toBe(`Bearer ${access}`);
});
