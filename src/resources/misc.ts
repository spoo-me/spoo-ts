import type { Transport, RequestOptions } from "../core/http.js";

/**
 * Health probe result. Hand-authored: the endpoint publishes no schema.
 *
 * - `healthy` (200): MongoDB and Redis are both reachable.
 * - `degraded` (200): MongoDB is up, Redis is down or not configured.
 * - `unhealthy` (503): MongoDB is unreachable.
 */
export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  /** Per-dependency detail, e.g. `{ mongodb: "ok", redis: "error: ..." }`. */
  checks: Record<string, string>;
}

export class Misc {
  constructor(private readonly transport: Transport) {}

  /**
   * Liveness of the API and its dependencies. No auth, no rate limit.
   *
   * A degraded system still answers 200, so a normal return does NOT mean
   * fully healthy — check `status`. An unhealthy system answers 503, which
   * the transport throws as `ServiceUnavailableError`; catching that is the
   * caller's job. Never retried by default (a probe must report the current
   * state, not paper over it); pass `maxRetries` explicitly to override.
   */
  async health(opts?: RequestOptions): Promise<HealthStatus> {
    return this.transport.request(
      { method: "GET", path: "/health" },
      { maxRetries: 0, ...opts },
    );
  }
}
