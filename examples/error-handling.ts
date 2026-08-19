// Every API failure is a typed error: switch on the class or on error.code.
import {
  APIConnectionError,
  NotFoundError,
  RateLimitError,
  Spoo,
  ValidationError,
} from "spoo.me";

// Retries are built in (2 by default, honoring Retry-After on 429s);
// tune them per client or per call.
const spoo = new Spoo({ maxRetries: 3, timeout: 15_000 });

try {
  await spoo.links.create(
    { long_url: "https://example.com", alias: "hopefully-free" },
    { maxRetries: 0 }, // per-request override
  );
} catch (err) {
  if (err instanceof ValidationError) {
    // 400 and 422 both land here; `field` names the offender when known.
    console.error(`invalid ${err.field ?? "request"}: ${err.message}`);
  } else if (err instanceof RateLimitError) {
    // Parsed X-RateLimit-* state, for proactive pacing.
    console.error(`limited, retry in ${err.rateLimit.retryAfter}s`, err.hint);
  } else if (err instanceof NotFoundError) {
    console.error("gone");
  } else if (err instanceof APIConnectionError) {
    console.error("network trouble", err.cause);
  } else {
    throw err;
  }
}

// Prefer codes over classes when you care about the exact condition:
// err.code is a typed union ("password_required", "blocked", "conflict", ...).
// Every error also carries requestId — quote it when contacting support.

// Public endpoints need no auth at all:
const anon = new Spoo();
const preview = await anon.public.preview("launch");
console.log(preview.status, preview.destination?.domain);
