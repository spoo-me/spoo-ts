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

Link ids are typed as `UrlId`, a branded string, so an alias cannot be
passed where an id belongs (they address different endpoints and the mixup
otherwise surfaces as a confusing 404 at runtime). Ids returned by the SDK
carry the type already; for ids you persisted as plain strings, mark them
with `asUrlId`:

```ts
import { asUrlId } from "spoo.me";

await spoo.links.delete(asUrlId(storedId));
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
await writeFile(file.filename, new Uint8Array(await file.data.arrayBuffer()));
```

`file.filename` is always present and always a bare basename: the
server-suggested name is sanitized, and a `spoo-export.<ext>` default fills
in when the server names no usable file. `file.data` is a `Blob`; Node
consumers who would rather stream than buffer can use `file.data.stream()`,
which returns a web `ReadableStream` that `Readable.fromWeb` bridges onto
Node streams:

```ts
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

await pipeline(Readable.fromWeb(file.data.stream()), createWriteStream(file.filename));
```

Public per-link stats need no account:

```ts
const stats = await spoo.public.stats("alias");
const preview = await spoo.public.preview("alias");
```

## Sign in with Spoo (connected apps)

Building an app that acts on behalf of a spoo.me user? The SDK ships the
client half of the PKCE flow: pair generation, the consent URL, code
exchange, and a self-refreshing token provider that handles rotation.

```ts
const pkce = await generatePkcePair();
const url = spoo.oauth.authorizationUrl({ appId, redirectUri, state, codeChallenge: pkce.challenge });
// open `url`, receive ?code=... on your redirect URI
const tokens = await spoo.oauth.exchangeCode({ code, codeVerifier: pkce.verifier });

const client = new Spoo({
  token: spoo.oauth.tokenProvider({ tokens, onRefresh: persist }),
});
```

Your app drives the browser and stores tokens; the SDK never does either.
Refresh tokens rotate on every refresh, so persist what `onRefresh` hands
you. A rejected refresh throws `SessionExpiredError`: send the user back
through login. App ids and redirect URIs are registered with spoo.me and
matched exactly. See [`examples/sign-in-with-spoo.ts`](./examples/sign-in-with-spoo.ts).

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
30 second timeout are configurable per client and per request:

```ts
const spoo = new Spoo({ maxRetries: 3, timeout: 15_000 });
await spoo.links.get(id, { maxRetries: 0, signal: controller.signal });
```

Requests that are not idempotent are only retried when the server provably
did no work.

## Raw requests

Every covered endpoint has a typed method, but the API can grow faster than
the SDK. The client's `get`, `post`, `patch` and `delete` methods send a
request through the same transport, so the configured auth, retries,
timeout, client tag and error mapping all still apply:

```ts
const membership = await spoo.get<{ plan: string }>("/api/v1/some/new/endpoint", {
  verbose: true,
});
await spoo.post("/api/v1/some/new/endpoint", { name: "value" });
```

These are supported and stable, but reaching for one usually means the SDK
surface has a gap. Please [file an issue](https://github.com/spoo-me/spoo-ts/issues)
naming the endpoint so it gets a typed method.

## Scope

The SDK covers the third-party integration surface of the API: identity
read (`auth.me`), Sign in with Spoo, and the full data plane, meaning
shortening, link management, claims, bulk operations, analytics, file
exports, public link reads and the emoji alias catalogue.

Deliberately out of scope: API key management, service health, the contact
form, profile management, and all legacy (v0) routes. Keys are managed in
the dashboard, health belongs to the status page, and the legacy routes
exist for backward compatibility, not for new integrations.

## API coverage

| Method | Endpoint |
| --- | --- |
| `links.create`, `links.checkAlias` | `POST /api/v1/shorten`, `GET /api/v1/shorten/check-alias` |
| `links.list` | `GET /api/v1/urls` |
| `links.get`, `links.getByAddress` | `GET /api/v1/urls/{id}`, `GET /api/v1/urls/{domain}/{alias}` |
| `links.update`, `links.setStatus` | `PATCH /api/v1/urls/{id}`, `PATCH /api/v1/urls/{id}/status` |
| `links.delete`, `links.deleteByDomain` | `DELETE /api/v1/urls/{id}`, `DELETE /api/v1/urls?domain=` |
| `links.claim` | `POST /api/v1/urls/claim` |
| `links.bulk.delete`, `links.bulk.setStatus`, `links.bulk.setExpiry`, `links.bulk.setDomain` | `POST /api/v1/urls/bulk/*` |
| `stats.get`, `stats.getForLink` | `GET /api/v1/stats`, `GET /api/v1/stats/links/{id}` |
| `stats.export`, `stats.exportForLink` | `GET /api/v1/export`, `GET /api/v1/export/links/{id}` |
| `public.stats`, `public.statsWithPassword` | `GET or POST /api/v1/public/stats/{code}` |
| `public.preview` | `GET /api/v1/public/preview/{code}` |
| `emoji.getSet` | `GET /api/v1/emoji-set` (ETag-cached) |
| `auth.me` | `GET /auth/me` |
| `oauth.exchangeCode`, `oauth.refreshTokens` | `POST /auth/device/token`, `POST /auth/device/refresh` |

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

[MIT](./LICENSE)
