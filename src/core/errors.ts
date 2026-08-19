/**
 * Typed error hierarchy for the spoo.me API.
 *
 * Every JSON error body has the shape `{ error, code, field?, details?, message?, hint? }`
 * and carries the same slug in the `X-Error-Code` response header. The SDK
 * discriminates on the body `code`, which works against any server version.
 */

/**
 * Machine-readable error codes the API emits today. The union is open
 * (`string & {}`) on purpose: the server adds codes over time and an unknown
 * code must flow through, not break the client.
 */
export type SpooErrorCode =
  | "internal_error"
  | "validation_error"
  | "authentication_error"
  | "password_required"
  | "invalid_password"
  | "forbidden"
  | "EMAIL_NOT_VERIFIED"
  | "not_found"
  | "feature_disabled"
  | "conflict"
  | "gone"
  | "blocked"
  | "rate_limit_exceeded"
  | "not_configured"
  | "payload_too_large"
  | "storage_error"
  | "cloudflare_api_error"
  | "cloudflare_not_configured"
  | "domain_already_registered"
  | "domain_not_verified"
  | "domain_blocklisted"
  | "invalid_domain_transition"
  | "domain_quota_exceeded"
  | "unfetchable"
  | "upstream_timeout"
  | "method_not_allowed"
  | (string & {});

/** Parsed JSON body of an error response. */
export interface SpooErrorBody {
  error: string;
  code: SpooErrorCode;
  field?: string;
  details?: unknown;
  message?: string;
  hint?: string;
}

/** Rate-limit state parsed from `X-RateLimit-*` response headers. */
export interface RateLimitInfo {
  /** Requests allowed in the current window (shortest window of the route's stacked limits). */
  limit?: number;
  /** Requests remaining in the current window. */
  remaining?: number;
  /** Unix epoch seconds when the window resets. */
  reset?: number;
  /** Seconds to wait before retrying. Only sent on 429 responses. */
  retryAfter?: number;
}

/** Base class for all errors thrown by the SDK. */
export class SpooError extends Error {
  override name = "SpooError";

  constructor(message: string) {
    super(message);
  }
}

/** The request reached the API and the API answered with an error status. */
export class APIError extends SpooError {
  override name = "APIError";

  /** HTTP status code of the response. */
  readonly status: number;
  /** Machine-readable error code from the response body. */
  readonly code: SpooErrorCode;
  /** The offending request field, when the API names one. */
  readonly field?: string;
  /** Structured extra context, e.g. per-field validation errors. */
  readonly details?: unknown;
  /** Human hint the API sometimes attaches (e.g. how to get higher rate limits). */
  readonly hint?: string;
  /** `X-Request-ID` of the failed request. Quote it in support requests. */
  readonly requestId?: string;
  /** Response headers of the failed request. */
  readonly headers: Headers;
  /** Parsed response body. */
  readonly body: SpooErrorBody;

  constructor(status: number, body: SpooErrorBody, headers: Headers) {
    super(`${status} ${body.code}: ${body.error}`);
    this.status = status;
    this.code = body.code;
    if (body.field !== undefined) this.field = body.field;
    if (body.details !== undefined) this.details = body.details;
    if (body.hint !== undefined) this.hint = body.hint;
    const requestId = headers.get("x-request-id");
    if (requestId !== null) this.requestId = requestId;
    this.headers = headers;
    this.body = body;
  }
}

export class AuthenticationError extends APIError {
  override name = "AuthenticationError";
}

export class ForbiddenError extends APIError {
  override name = "ForbiddenError";
}

export class NotFoundError extends APIError {
  override name = "NotFoundError";
}

export class ConflictError extends APIError {
  override name = "ConflictError";
}

export class GoneError extends APIError {
  override name = "GoneError";
}

export class PayloadTooLargeError extends APIError {
  override name = "PayloadTooLargeError";
}

/**
 * 400 and 422 both mean the request was invalid: typed domain validation
 * fails with 400, framework coercion with 422. Both land here; `status`
 * tells them apart when it matters.
 */
export class ValidationError extends APIError {
  override name = "ValidationError";
}

export class RateLimitError extends APIError {
  override name = "RateLimitError";

  /** Parsed `X-RateLimit-*` / `Retry-After` state at the time of rejection. */
  readonly rateLimit: RateLimitInfo;

  constructor(status: number, body: SpooErrorBody, headers: Headers) {
    super(status, body, headers);
    this.rateLimit = parseRateLimitHeaders(headers);
  }
}

/** 451: the destination was blocked for policy or legal reasons. */
export class ContentBlockedError extends APIError {
  override name = "ContentBlockedError";
}

export class InternalServerError extends APIError {
  override name = "InternalServerError";
}

export class ServiceUnavailableError extends APIError {
  override name = "ServiceUnavailableError";
}

/**
 * A connected-app session can no longer be refreshed: the refresh token was
 * rejected (rotated away, grant revoked, or expired). The only recovery is
 * sending the user through Sign in with Spoo again.
 */
export class SessionExpiredError extends SpooError {
  override name = "SessionExpiredError";

  constructor(options?: { cause?: unknown }) {
    super("Session expired: the refresh token was rejected. Re-authenticate the user.");
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** The request never produced a response (network failure, DNS, reset). */
export class APIConnectionError extends SpooError {
  override name = "APIConnectionError";

  constructor(message = "Connection error", options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** The request was aborted by the SDK because it exceeded the configured timeout. */
export class APITimeoutError extends APIConnectionError {
  override name = "APITimeoutError";

  constructor() {
    super("Request timed out");
  }
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const info: RateLimitInfo = {};
  const num = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const limit = num("x-ratelimit-limit");
  const remaining = num("x-ratelimit-remaining");
  const reset = num("x-ratelimit-reset");
  const retryAfter = num("retry-after");
  if (limit !== undefined) info.limit = limit;
  if (remaining !== undefined) info.remaining = remaining;
  if (reset !== undefined) info.reset = reset;
  if (retryAfter !== undefined) info.retryAfter = retryAfter;
  return info;
}

const ERROR_CLASS_BY_STATUS: Record<number, typeof APIError> = {
  400: ValidationError,
  401: AuthenticationError,
  403: ForbiddenError,
  404: NotFoundError,
  409: ConflictError,
  410: GoneError,
  413: PayloadTooLargeError,
  422: ValidationError,
  429: RateLimitError,
  451: ContentBlockedError,
  500: InternalServerError,
  502: InternalServerError,
  503: ServiceUnavailableError,
};

/** Map an error response to the right APIError subclass. */
export function apiErrorFromResponse(
  status: number,
  rawBody: unknown,
  headers: Headers,
): APIError {
  const body = normalizeErrorBody(status, rawBody, headers);
  const cls = ERROR_CLASS_BY_STATUS[status] ?? APIError;
  return new cls(status, body, headers);
}

function normalizeErrorBody(
  status: number,
  raw: unknown,
  headers: Headers,
): SpooErrorBody {
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as Record<string, unknown>)["code"] === "string" &&
    typeof (raw as Record<string, unknown>)["error"] === "string"
  ) {
    return raw as unknown as SpooErrorBody;
  }
  // Non-JSON or unexpected shape (edge-composed bodies, proxies). The message
  // stays terse — a proxy 502 body is an HTML page nobody wants in a toast —
  // and the raw text lives on details for anyone who needs it. The header
  // slug keeps the code usable even without a JSON body.
  return {
    error: `HTTP ${status}`,
    code: headers.get("x-error-code") ?? `http_${status}`,
    ...(typeof raw === "string" && raw.length > 0 ? { details: raw } : {}),
  };
}
