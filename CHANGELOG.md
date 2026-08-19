# spoo.me

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
