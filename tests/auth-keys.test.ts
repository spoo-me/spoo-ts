import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Spoo } from "../src/index.js";
import { base64url } from "../src/core/pkce.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (obj: unknown) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  return `${enc({ alg: "none" })}.${enc(payload)}.sig`;
}

test("auth.me unwraps the user envelope", async () => {
  server.use(
    http.get(`${BASE}/auth/me`, () =>
      HttpResponse.json({
        user: { id: "u1", email: "e@x.com", email_verified: true, plan: "free" },
      }),
    ),
  );
  const me = await new Spoo({ baseUrl: BASE, apiKey: "spoo_k" }).auth.me();
  expect(me.id).toBe("u1");
  expect(me.email_verified).toBe(true);
});

test("keys.list parses unix timestamps to Date; delete carries revoke", async () => {
  let deleteUrl: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/keys`, () =>
      HttpResponse.json({
        keys: [
          {
            id: "k1",
            name: "ci",
            scopes: ["urls:read"],
            created_at: 1704067200,
            expires_at: null,
            last_used_at: 1704070800,
            revoked: false,
            token_prefix: "spoo_abc1",
          },
        ],
      }),
    ),
    http.delete(`${BASE}/api/v1/keys/:id`, ({ request }) => {
      deleteUrl = new URL(request.url);
      return HttpResponse.json({ success: true, action: "revoked" });
    }),
  );
  const spoo = new Spoo({ baseUrl: BASE, token: "jwt" });
  const keys = await spoo.keys.list();
  expect(keys[0]?.created_at).toBeInstanceOf(Date);
  expect(keys[0]?.created_at?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  expect(keys[0]?.expires_at).toBeNull();

  const res = await spoo.keys.delete("k1", { revoke: true });
  expect(deleteUrl?.searchParams.get("revoke")).toBe("true");
  expect(res.action).toBe("revoked");
});

test("tokenProvider.invalidate forces a refresh on the next call", async () => {
  const longLived = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  let refreshes = 0;
  server.use(
    http.post(`${BASE}/auth/device/refresh`, () => {
      refreshes += 1;
      return HttpResponse.json({
        access_token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        refresh_token: `r${refreshes + 1}`,
      });
    }),
  );
  const provider = new Spoo({ baseUrl: BASE }).oauth.tokenProvider({
    tokens: { access_token: longLived, refresh_token: "r1" },
  });

  expect(await provider()).toBe(longLived); // fresh: no refresh
  expect(refreshes).toBe(0);

  provider.invalidate(); // e.g. after a 401 despite a fresh-looking token
  const next = await provider();
  expect(refreshes).toBe(1);
  expect(next).not.toBe(longLived);

  expect(await provider()).toBe(next); // refreshed token is trusted again
  expect(refreshes).toBe(1);
});

test("authorizationUrl omits redirect_uri when not given", () => {
  const url = new URL(
    new Spoo({ baseUrl: BASE }).oauth.authorizationUrl({
      appId: "spoo-snap",
      state: "s",
      codeChallenge: "c",
    }),
  );
  expect(url.searchParams.has("redirect_uri")).toBe(false);
  expect(url.searchParams.get("app_id")).toBe("spoo-snap");
});
