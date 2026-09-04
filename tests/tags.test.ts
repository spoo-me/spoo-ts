import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Spoo, asTagId, asUrlId } from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new Spoo({ baseUrl: BASE, apiKey: "spoo_test" });
}

const TAG_ID = asTagId("665f0c2f9e7a4b1d2c3d4e5f");

const TAG_BODY = {
  id: TAG_ID,
  name: "launch",
  color: "violet",
  icon: "rocket",
  link_count: 14,
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: null,
};

test("list hits GET /api/v1/tags and parses timestamps to Date", async () => {
  let method: string | undefined;
  server.use(
    http.get(`${BASE}/api/v1/tags`, ({ request }) => {
      method = request.method;
      return HttpResponse.json({
        items: [TAG_BODY, { ...TAG_BODY, id: "0".repeat(24), name: "q3", updated_at: 1767225600 }],
      });
    }),
  );
  const tags = await client().tags.list();
  expect(method).toBe("GET");
  expect(tags.map((t) => t.name)).toEqual(["launch", "q3"]);
  expect(tags[0]?.created_at).toBeInstanceOf(Date);
  expect(tags[0]?.created_at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  expect(tags[0]?.updated_at).toBeNull();
  expect(tags[1]?.updated_at?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  expect(tags[0]?.link_count).toBe(14);
});

test("create posts the params as the body and parses the 201", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/api/v1/tags`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(TAG_BODY, { status: 201 });
    }),
  );
  const tag = await client().tags.create({ name: "Launch", color: "violet", icon: "rocket" });
  expect(body).toEqual({ name: "Launch", color: "violet", icon: "rocket" });
  expect(tag.id).toBe(TAG_ID);
  expect(tag.created_at).toBeInstanceOf(Date);
});

test("create sends only the name when color and icon are left to the server", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/api/v1/tags`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(TAG_BODY, { status: 201 });
    }),
  );
  await client().tags.create({ name: "launch" });
  expect(body).toEqual({ name: "launch" });
});

test("update patches /api/v1/tags/{tag_id} with only the given fields", async () => {
  let body: unknown;
  let pathname: string | undefined;
  server.use(
    http.patch(`${BASE}/api/v1/tags/:id`, async ({ request }) => {
      body = await request.json();
      pathname = new URL(request.url).pathname;
      return HttpResponse.json({ ...TAG_BODY, color: "teal", updated_at: "2026-02-01T00:00:00+00:00" });
    }),
  );
  const tag = await client().tags.update(TAG_ID, { color: "teal" });
  expect(pathname).toBe(`/api/v1/tags/${TAG_ID}`);
  expect(body).toEqual({ color: "teal" });
  expect(tag.color).toBe("teal");
  expect(tag.updated_at?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
});

test("delete hits DELETE /api/v1/tags/{tag_id} and returns the wire shape", async () => {
  let method: string | undefined;
  let pathname: string | undefined;
  server.use(
    http.delete(`${BASE}/api/v1/tags/:id`, ({ request }) => {
      method = request.method;
      pathname = new URL(request.url).pathname;
      return HttpResponse.json({ deleted: true, links_updated: 3 });
    }),
  );
  const result = await client().tags.delete(TAG_ID);
  expect(method).toBe("DELETE");
  expect(pathname).toBe(`/api/v1/tags/${TAG_ID}`);
  expect(result).toEqual({ deleted: true, links_updated: 3 });
});

test("links.create sends tag_ids and surfaces tags on the created link", async () => {
  let body: unknown;
  server.use(
    http.post(`${BASE}/api/v1/shorten`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(
        {
          id: "0".repeat(24),
          alias: "demo",
          short_url: "https://spoo.test/demo",
          long_url: "https://example.com",
          created_at: 1704067200,
          status: "ACTIVE",
          claim_token: null,
          tags: [{ id: TAG_ID, name: "launch", color: "violet", icon: "rocket" }],
        },
        { status: 201 },
      );
    }),
  );
  const created = await client().links.create({
    long_url: "https://example.com",
    tag_ids: [TAG_ID],
  });
  expect(body).toEqual({ long_url: "https://example.com", tag_ids: [TAG_ID] });
  expect(created.tags?.[0]?.name).toBe("launch");
});

test("links.update sends tag_ids; null clears them", async () => {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${BASE}/api/v1/urls/:id`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ id: "0".repeat(24), alias: "demo" });
    }),
  );
  const id = asUrlId("0".repeat(24));
  await client().links.update(id, { tag_ids: [TAG_ID] });
  await client().links.update(id, { tag_ids: null });
  await client().links.update(id, { tag_ids: [] });
  expect(bodies).toEqual([{ tag_ids: [TAG_ID] }, { tag_ids: null }, { tag_ids: [] }]);
});

test("links.list puts the tag filters inside the filter JSON", async () => {
  let url: URL | undefined;
  server.use(
    http.get(`${BASE}/api/v1/urls`, ({ request }) => {
      url = new URL(request.url);
      return HttpResponse.json({
        items: [
          {
            id: "0".repeat(24),
            alias: "demo",
            password_set: false,
            tags: [{ id: TAG_ID, name: "launch", color: "violet", icon: "rocket" }],
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        hasNext: false,
        sortBy: "created_at",
        sortOrder: "descending",
      });
    }),
  );
  const page = await client().links.list({
    filter: { status: "ACTIVE", tagNames: ["launch", "q3"], tagsMatch: "all" },
  });
  expect(url!.searchParams.get("filter")).toBe(
    '{"status":"ACTIVE","tagNames":["launch","q3"],"tagsMatch":"all"}',
  );
  expect(page.items[0]?.tags?.[0]?.id).toBe(TAG_ID);

  await client().links.list({ filter: { tagIds: [TAG_ID] } });
  expect(url!.searchParams.get("filter")).toBe(`{"tagIds":["${TAG_ID}"]}`);
});

test("links.bulk.updateTags posts ids with add and remove", async () => {
  let body: unknown;
  let pathname: string | undefined;
  server.use(
    http.post(`${BASE}/api/v1/urls/bulk/tags`, async ({ request }) => {
      body = await request.json();
      pathname = new URL(request.url).pathname;
      return HttpResponse.json({
        summary: { total: 1, succeeded: 1, failed: 0 },
        results: [{ id: "0".repeat(24), alias: "demo", ok: true, error_code: null, error: null }],
      });
    }),
  );
  const ids = [asUrlId("0".repeat(24))];
  const result = await client().links.bulk.updateTags(ids, {
    add: [TAG_ID],
    remove: [asTagId("1".repeat(24))],
  });
  expect(pathname).toBe("/api/v1/urls/bulk/tags");
  expect(body).toEqual({ ids: ["0".repeat(24)], add: [TAG_ID], remove: ["1".repeat(24)] });
  expect(result.summary.succeeded).toBe(1);
  expect(result.results[0]?.ok).toBe(true);

  await client().links.bulk.updateTags(ids, { add: [TAG_ID] });
  expect(body).toEqual({ ids: ["0".repeat(24)], add: [TAG_ID] });
});
