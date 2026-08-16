import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ServiceUnavailableError, Spoo } from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("health returns the parsed status body", async () => {
  server.use(
    http.get(`${BASE}/health`, () =>
      HttpResponse.json({
        status: "healthy",
        version: "2.0.0",
        checks: { mongodb: "ok", redis: "ok" },
      }),
    ),
  );
  const health = await new Spoo({ baseUrl: BASE }).misc.health();
  expect(health.status).toBe("healthy");
  expect(health.checks["redis"]).toBe("ok");
});

test("a degraded system still resolves normally (200)", async () => {
  server.use(
    http.get(`${BASE}/health`, () =>
      HttpResponse.json({
        status: "degraded",
        version: "2.0.0",
        checks: { mongodb: "ok", redis: "error: connection refused" },
      }),
    ),
  );
  const health = await new Spoo({ baseUrl: BASE }).misc.health();
  expect(health.status).toBe("degraded");
});

test("503 throws ServiceUnavailableError without retrying", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/health`, () => {
      calls += 1;
      return HttpResponse.json(
        { error: "MongoDB unreachable", code: "internal_error" },
        { status: 503 },
      );
    }),
  );
  // Client-level retries must not apply to the health probe.
  const err = await new Spoo({ baseUrl: BASE, maxRetries: 3 }).misc
    .health()
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ServiceUnavailableError);
  expect(calls).toBe(1);
});
