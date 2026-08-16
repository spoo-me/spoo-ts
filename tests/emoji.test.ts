import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Spoo } from "../src/index.js";

const BASE = "https://spoo.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const EMOJI_BODY = {
  accept_max_version: 15.1,
  generate_max_version: 14,
  max_graphemes: 15,
  emoji: [{ c: "🚀", n: "rocket", g: "Travel & Places", gen: true }],
};

test("revalidates with If-None-Match and serves the cached body on 304", async () => {
  const etags: (string | null)[] = [];
  server.use(
    http.get(`${BASE}/api/v1/emoji-set`, ({ request }) => {
      const inm = request.headers.get("if-none-match");
      etags.push(inm);
      if (inm === '"v1"') return new HttpResponse(null, { status: 304 });
      return HttpResponse.json(EMOJI_BODY, { headers: { ETag: '"v1"' } });
    }),
  );
  const spoo = new Spoo({ baseUrl: BASE });
  const first = await spoo.emoji.getSet();
  const second = await spoo.emoji.getSet();
  expect(etags).toEqual([null, '"v1"']);
  expect(first.emoji[0]?.c).toBe("🚀");
  // The 304 answer is the very object cached from the 200.
  expect(second).toBe(first);
});

test("a changed set replaces the cache and the new ETag is used next", async () => {
  let calls = 0;
  const etags: (string | null)[] = [];
  server.use(
    http.get(`${BASE}/api/v1/emoji-set`, ({ request }) => {
      calls += 1;
      etags.push(request.headers.get("if-none-match"));
      if (calls === 1) {
        return HttpResponse.json(EMOJI_BODY, { headers: { ETag: '"v1"' } });
      }
      return HttpResponse.json(
        { ...EMOJI_BODY, max_graphemes: 20 },
        { headers: { ETag: '"v2"' } },
      );
    }),
  );
  const spoo = new Spoo({ baseUrl: BASE });
  await spoo.emoji.getSet();
  const updated = await spoo.emoji.getSet();
  await spoo.emoji.getSet();
  expect(updated.max_graphemes).toBe(20);
  expect(etags).toEqual([null, '"v1"', '"v2"']);
});

test("each client instance keeps its own cache", async () => {
  server.use(
    http.get(`${BASE}/api/v1/emoji-set`, ({ request }) => {
      if (request.headers.get("if-none-match") !== null) {
        return new HttpResponse(null, { status: 304 });
      }
      return HttpResponse.json(EMOJI_BODY, { headers: { ETag: '"v1"' } });
    }),
  );
  const a = new Spoo({ baseUrl: BASE });
  const b = new Spoo({ baseUrl: BASE });
  const fromA = await a.emoji.getSet();
  const fromB = await b.emoji.getSet();
  // Both fetched fresh: b never saw a's ETag.
  expect(fromB).not.toBe(fromA);
  expect(fromB).toEqual(fromA);
});
