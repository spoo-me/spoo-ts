import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  InternalServerError,
  NotFoundError,
  RateLimitError,
  Spoo,
  asUrlId,
} from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(overrides: ConstructorParameters<typeof Spoo>[0] = {}) {
  return new Spoo({ baseUrl: BASE, apiKey: "spoo_test", ...overrides });
}

test("maps a JSON error body to a typed error with code and request id", async () => {
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () =>
      HttpResponse.json(
        { error: "URL not found", code: "not_found" },
        { status: 404, headers: { "X-Request-ID": "req-123", "X-Error-Code": "not_found" } },
      ),
    ),
  );
  const err = await client()
    .links.get(asUrlId("0".repeat(24)))
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(NotFoundError);
  const notFound = err as NotFoundError;
  expect(notFound.code).toBe("not_found");
  expect(notFound.status).toBe(404);
  expect(notFound.requestId).toBe("req-123");
});

test("retries a 429 honoring Retry-After, then succeeds", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { error: "Too many requests", code: "rate_limit_exceeded" },
          { status: 429, headers: { "Retry-After": "0", "X-RateLimit-Remaining": "0" } },
        );
      }
      return HttpResponse.json({ id: "0".repeat(24), password_set: false });
    }),
  );
  const started = Date.now();
  const link = await client().links.get(asUrlId("0".repeat(24)));
  expect(calls).toBe(2);
  expect(link.id).toBe("0".repeat(24));
  // Retry-After 0 is honored as-is; computed backoff would sleep >= 250ms.
  expect(Date.now() - started).toBeLessThan(200);
});

test("honors an HTTP-date Retry-After; a past date means no wait", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { error: "Too many requests", code: "rate_limit_exceeded" },
          { status: 429, headers: { "Retry-After": new Date(Date.now() - 5_000).toUTCString() } },
        );
      }
      return HttpResponse.json({ id: "0".repeat(24), password_set: false });
    }),
  );
  const started = Date.now();
  await client().links.get(asUrlId("0".repeat(24)));
  expect(calls).toBe(2);
  expect(Date.now() - started).toBeLessThan(200);
});

test("a Retry-After beyond 60s surfaces the 429 immediately with the full wait", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () => {
      calls += 1;
      return HttpResponse.json(
        { error: "Too many requests", code: "rate_limit_exceeded" },
        { status: 429, headers: { "Retry-After": "120" } },
      );
    }),
  );
  const started = Date.now();
  const err = await client()
    .links.get(asUrlId("0".repeat(24)))
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RateLimitError);
  expect(calls).toBe(1);
  expect(Date.now() - started).toBeLessThan(500);
  // The uncapped mandated wait stays readable on the error.
  expect((err as RateLimitError).rateLimit.retryAfter).toBe(120);
});

test("an HTTP-date Retry-After beyond 60s surfaces immediately too", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () => {
      calls += 1;
      return HttpResponse.json(
        { error: "Too many requests", code: "rate_limit_exceeded" },
        { status: 429, headers: { "Retry-After": new Date(Date.now() + 300_000).toUTCString() } },
      );
    }),
  );
  const started = Date.now();
  const err = await client()
    .links.get(asUrlId("0".repeat(24)))
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RateLimitError);
  expect(calls).toBe(1);
  expect(Date.now() - started).toBeLessThan(500);
  const retryAfter = (err as RateLimitError).rateLimit.retryAfter;
  expect(retryAfter).toBeGreaterThanOrEqual(298);
  expect(retryAfter).toBeLessThanOrEqual(301);
});

test("computed backoff still applies when Retry-After is absent", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { error: "boom", code: "internal_error" },
          { status: 500 },
        );
      }
      return HttpResponse.json({ id: "0".repeat(24), password_set: false });
    }),
  );
  const started = Date.now();
  await client({ maxRetries: 1 }).links.get(asUrlId("0".repeat(24)));
  expect(calls).toBe(2);
  // First computed backoff is 500ms * jitter in [0.5, 1.0) => at least 250ms.
  expect(Date.now() - started).toBeGreaterThanOrEqual(240);
});

test("exhausted retries surface RateLimitError with parsed rate-limit state", async () => {
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () =>
      HttpResponse.json(
        { error: "Too many requests", code: "rate_limit_exceeded", hint: "authenticate" },
        {
          status: 429,
          headers: {
            "Retry-After": "0",
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "1755300000",
          },
        },
      ),
    ),
  );
  const err = await client({ maxRetries: 1 })
    .links.get(asUrlId("0".repeat(24)))
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RateLimitError);
  const rateLimited = err as RateLimitError;
  expect(rateLimited.rateLimit).toEqual({
    limit: 60,
    remaining: 0,
    reset: 1755300000,
    retryAfter: 0,
  });
  expect(rateLimited.hint).toBe("authenticate");
});

test("non-JSON error bodies never leak into the message", async () => {
  server.use(
    http.get(`${BASE}/api/v1/urls/:id`, () =>
      new HttpResponse("<!DOCTYPE html><html>bad gateway page</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    ),
  );
  const err = await client({ maxRetries: 0 })
    .links.get(asUrlId("0".repeat(24)))
    .catch((e: unknown) => e);
  const apiErr = err as InternalServerError;
  expect(apiErr.message).toBe("502 http_502: HTTP 502");
  expect(apiErr.body.error).toBe("HTTP 502");
  expect(apiErr.details).toContain("<!DOCTYPE html>");
});

test("does not retry a POST on 500", async () => {
  let calls = 0;
  server.use(
    http.post(`${BASE}/api/v1/shorten`, () => {
      calls += 1;
      return HttpResponse.json(
        { error: "boom", code: "internal_error" },
        { status: 500 },
      );
    }),
  );
  await expect(client().links.create({ long_url: "https://example.com" })).rejects.toThrow(
    "internal_error",
  );
  expect(calls).toBe(1);
});

test("sends bearer auth and the sdk client tag; parses created_at to Date", async () => {
  let seenAuth: string | null = null;
  let seenTag: string | null = null;
  server.use(
    http.post(`${BASE}/api/v1/shorten`, ({ request }) => {
      seenAuth = request.headers.get("authorization");
      seenTag = request.headers.get("x-spoo-client");
      return HttpResponse.json(
        {
          id: "0".repeat(24),
          alias: "demo",
          short_url: "https://spoo.test/demo",
          long_url: "https://example.com",
          created_at: 1704067200,
          status: "ACTIVE",
          claim_token: null,
        },
        { status: 201 },
      );
    }),
  );
  const created = await client().links.create({ long_url: "https://example.com" });
  expect(seenAuth).toBe("Bearer spoo_test");
  expect(seenTag).toMatch(/^sdk-ts\//);

  // First-party apps override the identity with their own slug
  await client({ clientTag: "raycast/3.0.0" }).links.create({
    long_url: "https://example.com",
  });
  expect(seenTag).toBe("raycast/3.0.0");
  expect(created.created_at).toBeInstanceOf(Date);
  expect(created.created_at.toISOString()).toBe("2024-01-01T00:00:00.000Z");
});

test("for await auto-paginates across pages", async () => {
  server.use(
    http.get(`${BASE}/api/v1/urls`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
      const items = [
        {
          id: `id-${page}-a`,
          alias: `a${page}`,
          password_set: false,
          created_at: "2026-01-01T00:00:00+00:00",
        },
        {
          id: `id-${page}-b`,
          alias: `b${page}`,
          domain: "go.example.com",
          password_set: false,
          created_at: "2026-01-02T00:00:00+00:00",
        },
      ];
      return HttpResponse.json({
        items,
        page,
        pageSize: 2,
        total: 4,
        hasNext: page < 2,
        sortBy: "created_at",
        sortOrder: "descending",
      });
    }),
  );
  const ids: string[] = [];
  const shortUrls: (string | undefined)[] = [];
  for await (const link of await client().links.list({ pageSize: 2 })) {
    expect(link.created_at).toBeInstanceOf(Date);
    ids.push(link.id);
    shortUrls.push(link.short_url);
  }
  expect(ids).toEqual(["id-1-a", "id-1-b", "id-2-a", "id-2-b"]);
  // short_url is derived: base URL for the default namespace, https + domain otherwise
  expect(shortUrls[0]).toBe(`${BASE}/a1`);
  expect(shortUrls[1]).toBe("https://go.example.com/b1");
});

test("claim maps camelCase inputs onto the wire shape", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/api/v1/urls/claim`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        results: [{ url_id: "0".repeat(24), status: "claimed" }],
        claimed: 1,
        failed: 0,
      });
    }),
  );
  await client().links.claim([{ urlId: asUrlId("0".repeat(24)), claimToken: "deed" }]);
  expect(body).toEqual({
    claims: [{ url_id: "0".repeat(24), token: "deed" }],
  });
});

test("raw get sends auth, client tag and query through the transport", async () => {
  let seenAuth: string | null = null;
  let seenTag: string | null = null;
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/some/new/endpoint`, ({ request }) => {
      seenAuth = request.headers.get("authorization");
      seenTag = request.headers.get("x-spoo-client");
      url = new URL(request.url);
      return HttpResponse.json({ answer: 42 });
    }),
  );
  const data = await client().get<{ answer: number }>("/api/v1/some/new/endpoint", {
    page: 2,
    verbose: true,
    skipped: undefined,
  });
  expect(data.answer).toBe(42);
  expect(seenAuth).toBe("Bearer spoo_test");
  expect(seenTag).toMatch(/^sdk-ts\//);
  expect(url!.searchParams.get("page")).toBe("2");
  expect(url!.searchParams.get("verbose")).toBe("true");
  expect(url!.searchParams.has("skipped")).toBe(false);
});

test("raw post sends a JSON body and maps errors like every typed method", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/api/v1/some/new/endpoint`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(
        { error: "nope", code: "not_found" },
        { status: 404 },
      );
    }),
  );
  const err = await client()
    .post<never>("/api/v1/some/new/endpoint", { name: "x" })
    .catch((e: unknown) => e);
  expect(body).toEqual({ name: "x" });
  expect(err).toBeInstanceOf(NotFoundError);
});

test("raw patch and delete hit the given path", async () => {
  const seen: string[] = [];
  server.use(
    http.patch(`${BASE}/api/v1/thing/1`, ({ request }) => {
      seen.push(`PATCH ${new URL(request.url).pathname}`);
      return HttpResponse.json({ ok: true });
    }),
    http.delete(`${BASE}/api/v1/thing/1`, ({ request }) => {
      seen.push(`DELETE ${new URL(request.url).pathname}`);
      return HttpResponse.json({ ok: true });
    }),
  );
  await client().patch<{ ok: boolean }>("/api/v1/thing/1", { field: "v" });
  await client().delete<{ ok: boolean }>("/api/v1/thing/1");
  expect(seen).toEqual(["PATCH /api/v1/thing/1", "DELETE /api/v1/thing/1"]);
});
