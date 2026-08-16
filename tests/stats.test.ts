import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Spoo } from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new Spoo({ baseUrl: BASE, apiKey: "spoo_test" });
}

const STATS_BODY = {
  scope: "all",
  filters: {},
  group_by: ["time"],
  timezone: "UTC",
  time_range: { start_date: null, end_date: null },
  summary: { total_clicks: 10, unique_clicks: 7 },
  metrics: {
    clicks_by_time: [{ time: "2026-01-01", clicks: 10, clicks_percentage: 100 }],
  },
};

test("serializes every param group onto the wire shape", async () => {
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/stats`, ({ request }) => {
      url = new URL(request.url);
      return HttpResponse.json(STATS_BODY);
    }),
  );
  const stats = await client().stats.get({
    scope: "all",
    shortCode: "mylink",
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: 1767225599,
    groupBy: ["time", "browser"],
    metrics: ["clicks", "unique_clicks"],
    timezone: "Asia/Kolkata",
    filters: { country: ["United States", "Canada"] },
    browser: ["Chrome", "Firefox"],
    device: ["mobile", "desktop"],
    utm_source: ["newsletter", "(none)"],
  });
  expect(url).toBeDefined();
  const q = url!.searchParams;
  expect(q.get("scope")).toBe("all");
  expect(q.get("short_code")).toBe("mylink");
  expect(q.get("start_date")).toBe("2026-01-01T00:00:00.000Z");
  expect(q.get("end_date")).toBe("1767225599");
  expect(q.get("group_by")).toBe("time,browser");
  expect(q.get("metrics")).toBe("clicks,unique_clicks");
  expect(q.get("timezone")).toBe("Asia/Kolkata");
  expect(q.get("filters")).toBe('{"country":["United States","Canada"]}');
  expect(q.get("browser")).toBe("Chrome,Firefox");
  expect(q.get("device")).toBe("mobile,desktop");
  expect(q.get("utm_source")).toBe("newsletter,(none)");
  // Untouched shortcut filters must not appear at all.
  expect(q.has("os")).toBe(false);
  expect(q.has("country")).toBe(false);
  expect(stats.summary.total_clicks).toBe(10);
  expect(stats.metrics?.["clicks_by_time"]?.[0]?.["clicks"]).toBe(10);
});

test("omits every optional param that was not given", async () => {
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/stats`, ({ request }) => {
      url = new URL(request.url);
      return HttpResponse.json(STATS_BODY);
    }),
  );
  await client().stats.get({ scope: "anon", shortCode: "mylink" });
  expect([...url!.searchParams.keys()].sort()).toEqual(["scope", "short_code"]);
});

test("export returns a Blob and the Content-Disposition filename", async () => {
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/export`, ({ request }) => {
      url = new URL(request.url);
      return new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="spoo-stats.zip"',
        },
      });
    }),
  );
  const result = await client().stats.export(
    { scope: "all", groupBy: ["browser"] },
    "csv",
  );
  expect(url!.searchParams.get("format")).toBe("csv");
  expect(url!.searchParams.get("group_by")).toBe("browser");
  expect(result.data).toBeInstanceOf(Blob);
  expect(result.data.size).toBe(4);
  expect(result.filename).toBe("spoo-stats.zip");
});

test("export parses an RFC 5987 encoded filename", async () => {
  server.use(
    http.get(`${BASE}/api/v1/export`, () =>
      new HttpResponse(new Uint8Array([1]).buffer, {
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''stats%20%F0%9F%93%88.json",
        },
      }),
    ),
  );
  const result = await client().stats.export({ scope: "all" }, "json");
  expect(result.filename).toBe("stats 📈.json");
});

test("export omits filename when the header is absent", async () => {
  server.use(
    http.get(`${BASE}/api/v1/export`, () => new HttpResponse(new Uint8Array([1]).buffer)),
  );
  const result = await client().stats.export({ scope: "all" }, "xlsx");
  expect(result.filename).toBeUndefined();
  expect("filename" in result).toBe(false);
});
