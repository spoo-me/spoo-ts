import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { toWire, type TimestampInput } from "../core/timestamps.js";

type Schemas = components["schemas"];

/**
 * One row of a metrics breakdown. Keys are dynamic: the dimension name
 * (e.g. `browser`), the metric name (e.g. `clicks`) and
 * `{metric}_percentage` — the schema cannot enumerate them.
 */
export interface StatsDataPoint {
  [key: string]: string | number;
}

/**
 * Stats payload with the dynamic `metrics` dict typed. Keys follow
 * `{metric}_by_{dimension}` (e.g. `clicks_by_browser`, `unique_clicks_by_time`).
 */
export interface StatsResponse extends Omit<Schemas["StatsResponse"], "metrics"> {
  metrics?: Record<string, StatsDataPoint[]>;
}

/** Per-link stats: the aggregate payload plus the link's identity. */
export interface LinkStatsResponse
  extends Omit<Schemas["LinkStatsResponse"], "metrics"> {
  metrics?: Record<string, StatsDataPoint[]>;
}

export type StatsExportFormat = "csv" | "xlsx" | "json" | "xml";

/** A generated export file. `csv` format is a ZIP archive, not a bare CSV. */
export interface StatsExport {
  data: Blob;
  /** Parsed from the Content-Disposition header, when the server names the file. */
  filename?: string;
}

/**
 * Window, breakdown and filter parameters shared by every stats call.
 * All stats endpoints are authenticated; unauthenticated per-link stats
 * live under `spoo.public`.
 */
export interface StatsParams {
  /** Defaults to the URL creation date. */
  startDate?: TimestampInput;
  /** Defaults to now. Window may span at most 90 days. */
  endDate?: TimestampInput;
  /**
   * Breakdown dimensions: time, browser, os, device, country, city, referrer,
   * short_code, utm_source, utm_medium, utm_campaign. Defaults to `["time"]`.
   */
  groupBy?: string[];
  /** Defaults to both. */
  metrics?: ("clicks" | "unique_clicks")[];
  /** IANA name, e.g. "Asia/Kolkata". Defaults to UTC. */
  timezone?: string;
  /**
   * Dimension filters, `{dimension: [values]}`. Values are case-sensitive and
   * must match the stored capitalization exactly. Combinable with the
   * per-dimension shortcuts below.
   */
  filters?: Record<string, string[]>;
  /** Case-sensitive, e.g. "Chrome", "Firefox". */
  browser?: string[];
  /** Case-sensitive, e.g. "Windows", "macOS". */
  os?: string[];
  /** "mobile" | "tablet" | "desktop" | "unknown" (also matches pre-tracking clicks). */
  device?: string[];
  /** Full country names as stored, e.g. "United States". */
  country?: string[];
  city?: string[];
  /** Full URLs including protocol. */
  referrer?: string[];
  /** `(none)` matches untagged clicks. */
  utm_source?: string[];
  utm_medium?: string[];
  utm_campaign?: string[];
}

/** Aggregate-only filters: slice your account-wide stats to specific links. */
export interface AggregateStatsParams extends StatsParams {
  /** Aliases to slice to. Aliases you do not own simply match nothing. */
  shortCode?: string[];
  /** Link ids to slice to. Ids you do not own simply match nothing. */
  urlId?: string[];
}

function buildStatsQuery(
  params: AggregateStatsParams,
): Record<string, string | number | undefined> {
  return {
    start_date: params.startDate !== undefined ? toWire(params.startDate) : undefined,
    end_date: params.endDate !== undefined ? toWire(params.endDate) : undefined,
    group_by: params.groupBy?.join(","),
    metrics: params.metrics?.join(","),
    timezone: params.timezone,
    filters: params.filters !== undefined ? JSON.stringify(params.filters) : undefined,
    browser: params.browser?.join(","),
    os: params.os?.join(","),
    device: params.device?.join(","),
    country: params.country?.join(","),
    city: params.city?.join(","),
    referrer: params.referrer?.join(","),
    utm_source: params.utm_source?.join(","),
    utm_medium: params.utm_medium?.join(","),
    utm_campaign: params.utm_campaign?.join(","),
    short_code: params.shortCode?.join(","),
    url_id: params.urlId?.join(","),
  };
}

/** Extract the filename from a Content-Disposition header, RFC 5987 first. */
function filenameFromDisposition(value: string | null): string | undefined {
  if (value === null) return undefined;
  const encoded = /filename\*=utf-8''([^;]+)/i.exec(value);
  if (encoded?.[1] !== undefined) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed encoding; fall through to the plain form.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1]?.trim();
}

export class Stats {
  constructor(private readonly transport: Transport) {}

  /**
   * Click analytics aggregated across every link you own, optionally sliced
   * with `shortCode`/`urlId`. Needs the `stats:read`, `urls:read` or
   * `admin:all` scope. Rate limits: 60/min, 5,000/day.
   */
  async get(params: AggregateStatsParams = {}, opts?: RequestOptions): Promise<StatsResponse> {
    return this.transport.request(
      { method: "GET", path: "/api/v1/stats", query: buildStatsQuery(params) },
      opts,
    );
  }

  /**
   * Click analytics for one link you own, addressed by its id. Same window,
   * breakdown and filter parameters as the aggregate call.
   */
  async getForLink(
    urlId: string,
    params: StatsParams = {},
    opts?: RequestOptions,
  ): Promise<LinkStatsResponse> {
    return this.transport.request(
      {
        method: "GET",
        path: `/api/v1/stats/links/${encodeURIComponent(urlId)}`,
        query: buildStatsQuery(params),
      },
      opts,
    );
  }

  /**
   * Download one link's analytics as a file, addressed by its id. Prefer
   * this over `export` with a urlId filter for single links: the server
   * names the file after the link's alias, so exports of different links
   * never collide.
   */
  async exportForLink(
    urlId: string,
    params: StatsParams,
    format: StatsExportFormat,
    opts?: RequestOptions,
  ): Promise<StatsExport> {
    const { data, meta } = await this.transport.requestWithMeta<Blob>(
      {
        method: "GET",
        path: `/api/v1/export/links/${encodeURIComponent(urlId)}`,
        query: { ...buildStatsQuery(params), format },
        responseAs: "blob",
      },
      opts,
    );
    const filename = filenameFromDisposition(meta.headers.get("content-disposition"));
    return { data, ...(filename !== undefined ? { filename } : {}) };
  }

  /**
   * Download the same analytics as a file. The `csv` format is a ZIP archive
   * (summary.csv plus one CSV per dimension), not a bare CSV. Export
   * generation is resource-intensive, so tighter limits apply: 30/min,
   * 1,000/day. The filename is constant for aggregate exports; use
   * `exportForLink` for per-link files.
   */
  async export(
    params: AggregateStatsParams,
    format: StatsExportFormat,
    opts?: RequestOptions,
  ): Promise<StatsExport> {
    const { data, meta } = await this.transport.requestWithMeta<Blob>(
      {
        method: "GET",
        path: "/api/v1/export",
        query: { ...buildStatsQuery(params), format },
        responseAs: "blob",
      },
      opts,
    );
    const filename = filenameFromDisposition(meta.headers.get("content-disposition"));
    return { data, ...(filename !== undefined ? { filename } : {}) };
  }
}
