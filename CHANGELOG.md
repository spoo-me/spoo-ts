# spoo.me

## 0.9.0

### Minor Changes

- The default request timeout drops from 60 to 30 seconds, aligning all spoo
  SDKs on one value. Override per client or per request if you need longer.

## 0.8.0

### Minor Changes

- Hardening from the cross-SDK audit: non-JSON error bodies (proxy 502 pages)
  no longer become the error message (terse HTTP status instead, raw text on
  details); Page.getNextPage() throws a SpooError; Logger and RequestHooks are
  exported; the unreachable BadRequestError class is removed (400 maps to
  ValidationError by design).

## 0.7.0

### Minor Changes

- Adds stats.exportForLink(): per-link file exports whose filename the server
  derives from the alias, so exports of different links never collide. The
  aggregate export keeps its constant filename and now documents it.

## 0.6.1

### Patch Changes

- Fixes links.claim(): the wire field for the claim token is `token`, not
  `claim_token`, so every earlier version failed server-side validation on
  claim. The request body is now typed against the generated schema so a
  shape drift is a compile error. Claims are capped at 16 per call.

## 0.6.0

### Minor Changes

- Refinements from porting the first-party apps: Link gains a client-derived
  short_url (base URL or custom domain plus alias), the public stats payload
  is fully typed instead of an unknown map, and decodeJwtPayload is exported
  for apps that schedule their own refresh.

## 0.5.0

### Minor Changes

- ba30554: Removes misc.health(). The SDK surface is the third-party integration
  contract: service health belongs to the status page, not the client.
  Breaking pre-1.0 removal.
- 0d3b9d6: What the first-party ports needed: auth.me() (works with API keys and app
  tokens), an invalidate() handle on tokenProvider for retry-on-401, and
  authorizationUrl accepting a registered-default redirect (redirectUri now
  optional).

## 0.4.0

Correction (2026-08-19): an earlier draft of these notes listed keys.list and
keys.delete; key management never shipped in 0.4.0 and is out of the SDK's
scope.

### Minor Changes

- What the first-party ports needed: auth.me() (works with API keys and app
  tokens), an invalidate()
  handle on tokenProvider for retry-on-401, and authorizationUrl accepting a
  registered-default redirect (redirectUri now optional).

## 0.3.0

### Minor Changes

- clientTag client option: first-party apps built on the SDK set their own
  X-Spoo-Client identity (e.g. raycast/3.0.0) so traffic attributes to the
  product rather than the SDK default.

## 0.2.0

### Minor Changes

- Sign in with Spoo for connected apps: spoo.oauth with PKCE pair generation,
  authorization URL building, code exchange, token refresh with rotation, and a
  self-refreshing single-flight token provider for `new Spoo({ token })`.
  Rejected refreshes throw the new SessionExpiredError.

## 0.1.0

### Minor Changes

- First release. Links (create, manage, claim, bulk operations), analytics
  (account aggregate, per-link stats, file exports), public link stats and
  previews, the emoji alias catalogue, and health. Typed errors, automatic
  retries honoring Retry-After, async-iterator pagination, Date timestamps
  everywhere, zero runtime dependencies, ESM on Node 20+ and edge runtimes.
