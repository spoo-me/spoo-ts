import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { toWire, type TimestampInput } from "../core/timestamps.js";

type Schemas = components["schemas"];

export type PublicStatsResponse = Schemas["PublicStatsResponse"];
export type PublicPreviewResponse = Schemas["PublicPreviewResponse"];

export interface PublicStatsOptions {
  /** Defaults to the link creation date. */
  startDate?: TimestampInput;
  /** Defaults to now. */
  endDate?: TimestampInput;
  /** IANA name for time bucketing. Defaults to UTC. */
  timezone?: string;
}

function buildWindowQuery(
  params: PublicStatsOptions,
): Record<string, string | number | undefined> {
  return {
    start_date: params.startDate !== undefined ? toWire(params.startDate) : undefined,
    end_date: params.endDate !== undefined ? toWire(params.endDate) : undefined,
    timezone: params.timezone,
  };
}

/**
 * Public, unauthenticated read endpoints for a single short link. An
 * authenticated owner additionally sees private-stats links and skips the
 * password gate; everyone else gets the same answer.
 */
export class PublicLinks {
  constructor(private readonly transport: Transport) {}

  /**
   * Public stats for one short link (both URL generations plus emoji aliases
   * on the default domain). A link whose stats are private answers exactly
   * like a missing code — the 404 is byte-identical, on purpose. A
   * password-protected link answers 401 `password_required`; use
   * {@link statsWithPassword}. Rate limits: 60/min, 2,000/day authenticated;
   * 20/min, 500/day anonymous.
   */
  async stats(
    shortCode: string,
    params: PublicStatsOptions = {},
    opts?: RequestOptions,
  ): Promise<PublicStatsResponse> {
    return this.transport.request(
      {
        method: "GET",
        path: `/api/v1/public/stats/${encodeURIComponent(shortCode)}`,
        query: buildWindowQuery(params),
      },
      opts,
    );
  }

  /**
   * Same as {@link stats}, carrying the stats-page password. The JSON body is
   * the ONLY channel the server reads a password from — query-string
   * passwords are ignored so they can't land in URLs, logs or referrers. A
   * wrong password answers 401 `invalid_password` (retryable with a new
   * password).
   */
  async statsWithPassword(
    shortCode: string,
    password: string,
    params: PublicStatsOptions = {},
    opts?: RequestOptions,
  ): Promise<PublicStatsResponse> {
    return this.transport.request(
      {
        method: "POST",
        path: `/api/v1/public/stats/${encodeURIComponent(shortCode)}`,
        query: buildWindowQuery(params),
        body: { password },
      },
      opts,
    );
  }

  /**
   * Where a short link leads, before following it. `destination` and
   * `geo_destinations` are non-null only while the link is active and not
   * password-protected — the preview never reveals a destination the redirect
   * would refuse to serve. Owner-set social meta never appears here.
   * Rate limits: 30/min, 2,000/day.
   */
  async preview(shortCode: string, opts?: RequestOptions): Promise<PublicPreviewResponse> {
    return this.transport.request(
      {
        method: "GET",
        path: `/api/v1/public/preview/${encodeURIComponent(shortCode)}`,
      },
      opts,
    );
  }
}
