import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { AuthenticationError, NotFoundError, Spoo } from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Public endpoints need no credentials.
function client() {
  return new Spoo({ baseUrl: BASE });
}

const PUBLIC_STATS_BODY = {
  generation: "v2",
  link: {
    alias: "demo",
    short_url: "https://spoo.test/demo",
    long_url: "https://example.com",
    created_at: "2026-01-01T00:00:00+00:00",
    status: "active",
    max_clicks: null,
    block_bots: false,
    password_protected: false,
  },
  stats: { summary: { total_clicks: 3, unique_clicks: 2 } },
};

test("stats percent-encodes emoji aliases and maps the window params", async () => {
  let path: string | undefined;
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/public/stats/:code`, ({ request }) => {
      url = new URL(request.url);
      path = url.pathname;
      return HttpResponse.json(PUBLIC_STATS_BODY);
    }),
  );
  const res = await client().public.stats("🚀🌟", {
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: "2026-02-01T00:00:00Z",
    timezone: "UTC",
  });
  expect(path).toBe("/api/v1/public/stats/%F0%9F%9A%80%F0%9F%8C%9F");
  expect(url!.searchParams.get("start_date")).toBe("2026-01-01T00:00:00.000Z");
  expect(url!.searchParams.get("end_date")).toBe("2026-02-01T00:00:00Z");
  expect(url!.searchParams.get("timezone")).toBe("UTC");
  expect(res.generation).toBe("v2");
  expect(res.link.alias).toBe("demo");
});

test("statsWithPassword POSTs the password in the JSON body only", async () => {
  let body: unknown;
  let url: URL | undefined;
  server.use(
    http.post(`${BASE}/api/v1/public/stats/:code`, async ({ request }) => {
      body = await request.json();
      url = new URL(request.url);
      return HttpResponse.json(PUBLIC_STATS_BODY);
    }),
  );
  await client().public.statsWithPassword("demo", "hunter2.A", { timezone: "UTC" });
  expect(body).toEqual({ password: "hunter2.A" });
  // The password must never ride the query string.
  expect(url!.search).toBe("?timezone=UTC");
});

test("a password-protected link surfaces 401 password_required", async () => {
  server.use(
    http.get(`${BASE}/api/v1/public/stats/:code`, () =>
      HttpResponse.json(
        { error: "Password required", code: "password_required" },
        { status: 401 },
      ),
    ),
  );
  const err = await client()
    .public.stats("locked")
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AuthenticationError);
  expect((err as AuthenticationError).code).toBe("password_required");
});

test("a wrong password surfaces 401 invalid_password", async () => {
  server.use(
    http.post(`${BASE}/api/v1/public/stats/:code`, () =>
      HttpResponse.json(
        { error: "Invalid password", code: "invalid_password" },
        { status: 401 },
      ),
    ),
  );
  const err = await client()
    .public.statsWithPassword("locked", "wrong")
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AuthenticationError);
  expect((err as AuthenticationError).code).toBe("invalid_password");
});

test("private-stats links 404 exactly like missing codes", async () => {
  server.use(
    http.get(`${BASE}/api/v1/public/stats/:code`, () =>
      HttpResponse.json({ error: "URL not found", code: "not_found" }, { status: 404 }),
    ),
  );
  const err = await client()
    .public.stats("private-or-missing")
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(NotFoundError);
});

test("preview hits the preview path and returns the resolved facts", async () => {
  let path: string | undefined;
  server.use(
    http.get(`${BASE}/api/v1/public/preview/:code`, ({ request }) => {
      path = new URL(request.url).pathname;
      return HttpResponse.json({
        generation: "v2",
        alias: "demo",
        short_url: "https://spoo.test/demo",
        status: "active",
        created_at: "2026-01-01T00:00:00+00:00",
        password_protected: false,
        destination: {
          url: "https://example.com/page",
          domain: "example.com",
          path: "/page",
          is_https: true,
        },
        geo_destinations: null,
      });
    }),
  );
  const preview = await client().public.preview("demo");
  expect(path).toBe("/api/v1/public/preview/demo");
  expect(preview.status).toBe("active");
  expect(preview.destination?.domain).toBe("example.com");
});
