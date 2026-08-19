# spoo.me TypeScript SDK

The official TypeScript SDK for the [spoo.me](https://spoo.me) link management API.

```ts
import { Spoo } from "spoo.me";

const spoo = new Spoo({ apiKey: "spoo_..." });

const link = await spoo.links.create({ long_url: "https://example.com/launch" });
console.log(link.short_url); // https://spoo.me/xyz
```

- Zero runtime dependencies, built on global `fetch`
- Runs on Node 20+, Cloudflare Workers, Vercel Edge, Deno, Bun and browsers
- Typed errors, automatic retries, async-iterator pagination
- Types generated from the API's OpenAPI spec, so they cannot drift

## Install

```sh
npm install spoo.me
```

## Authentication

Create an API key from your [spoo.me dashboard](https://spoo.me). The client
reads `SPOO_API_KEY` from the environment, or takes the key explicitly:

```ts
const spoo = new Spoo();                       // uses SPOO_API_KEY
const spoo = new Spoo({ apiKey: "spoo_..." }); // explicit
const spoo = new Spoo({ token: async () => myJwt }); // app tokens
```

Constructing without credentials is valid too: anonymous shortening and the
public endpoints work without an account.

Self-hosting spoo.me? Point the client at your instance with
`new Spoo({ baseUrl: "https://links.example.com" })`.

## Shorten links

```ts
const link = await spoo.links.create({
  long_url: "https://example.com/launch",
  alias: "launch",                              // or emoji: "🚀🔥"
  password: "optional-password",
  max_clicks: 10_000,
  expire_after: new Date("2026-12-31T23:59:59Z"),
});
```

Timestamps are accepted as `Date`, ISO 8601 strings, or unix epoch seconds
everywhere, and returned as `Date` objects everywhere.

Anonymous creations return a one-time `claim_token`. Store it and the link can
be claimed into an account later with `spoo.links.claim()`.

## Manage links

```ts
const link = await spoo.links.get(id);
await spoo.links.update(id, { max_clicks: 500 });
await spoo.links.setStatus(id, "INACTIVE");
await spoo.links.delete(id);
```

Bulk operations take up to 100 ids and report per-item results instead of
throwing, so a partial failure never aborts the batch:

```ts
const result = await spoo.links.bulk.setStatus(ids, "INACTIVE");
console.log(result.summary); // { total, succeeded, failed }
```

## Pagination

Every list is a `Page`: use it directly, walk it by hand, or iterate items
across all pages with `for await`.

```ts
for await (const link of await spoo.links.list({ sortBy: "total_clicks" })) {
  console.log(link.alias, link.total_clicks);
}
```

## Analytics

```ts
// Aggregate across everything you own, sliced and filtered
const stats = await spoo.stats.get({
  startDate: new Date("2026-01-01"),
  groupBy: ["time", "country"],
  device: ["mobile"],
  timezone: "Asia/Kolkata",
});

// One link, by id
const one = await spoo.stats.getForLink(id, { groupBy: ["referrer"] });

// File exports (csv is a ZIP archive with one CSV per dimension)
const file = await spoo.stats.export({ groupBy: ["country"] }, "xlsx");
```

Public per-link stats need no account:

```ts
const stats = await spoo.public.stats("alias");
const preview = await spoo.public.preview("alias");
```

## Errors

Failed requests throw a typed subclass of `SpooError`:

| Status | Class |
| --- | --- |
| 400, 422 | `ValidationError` |
| 401 | `AuthenticationError` |
| 403 | `ForbiddenError` |
| 404 | `NotFoundError` |
| 409 | `ConflictError` |
| 410 | `GoneError` |
| 413 | `PayloadTooLargeError` |
| 429 | `RateLimitError` |
| 451 | `ContentBlockedError` |
| 5xx | `InternalServerError`, `ServiceUnavailableError` |
| (no response) | `APIConnectionError`, `APITimeoutError` |

Every error carries the machine-readable `code` from the API (a typed union
such as `"password_required"`, `"blocked"`, `"conflict"`), the `requestId` to
quote in support requests, and the response headers. `RateLimitError` also
exposes the parsed rate-limit state:

```ts
try {
  await spoo.links.create({ long_url });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(err.rateLimit.retryAfter, err.hint);
  }
}
```

## Retries and timeouts

Failed requests are retried twice by default with exponential backoff and
jitter, honoring the `Retry-After` header on 429 responses. Retries and the
60 second timeout are configurable per client and per request:

```ts
const spoo = new Spoo({ maxRetries: 3, timeout: 15_000 });
await spoo.links.get(id, { maxRetries: 0, signal: controller.signal });
```

Requests that are not idempotent are only retried when the server provably
did no work.

## Requirements

Node 20 or later, or any runtime with WHATWG `fetch`: Cloudflare Workers,
Vercel Edge, Deno, Bun, evergreen browsers. The package is ESM only.

Using an API key in a browser exposes it to every visitor, so the client
refuses to start with a key in a browser unless you pass
`dangerouslyAllowBrowser: true`. Keyless anonymous usage needs no flag.

## Versioning

The SDK follows SemVer and is currently 0.x while the surface settles. New
API endpoints and new optional fields ship as minor versions. Response types
can gain fields at any time; the SDK does not validate responses at runtime,
so additive API changes never break an installed version.

## More

Runnable samples live in [`examples/`](./examples). Full API documentation is
at [docs.spoo.me](https://docs.spoo.me).

## License

[AGPL-3.0](./LICENSE)
