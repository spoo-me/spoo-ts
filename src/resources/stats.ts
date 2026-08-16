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

export type StatsExportFormat = "csv" | "xlsx" | "json" | "xml";

/** A generated export file. `csv` format is a ZIP archive, not a bare CSV. */
export interface StatsExport {
  data: Blob;
  /** Parsed from the Content-Disposition header, when the server names the file. */
  filename?: string;
}

export interface StatsParams {
  /**
   * `all` aggregates across every URL you own and requires authentication;
   * `anon` reads public stats for one URL (requires `shortCode`, no auth
   * unless the link's stats are private).
   */
  scope: "all" | "anon";
  /** Required with `scope: "anon"`; optional single-URL filter with `scope: "all"`. */
  shortCode?: string;
  /** Defaults to the URL creation date. */
  startDate?: TimestampInput;
  /** Defaults to now. */
  endDate?: TimestampInput;
  /**
   * Breakdown dimensions: time, browser, os, device, country, city, referrer,
   * short_code (scope=all only), utm_source, utm_medium, utm_campaign.
   * Defaults to `["time"]`.
   */
  groupBy?: string[];
  /** Defaults to both. */
  metrics?: ("clicks" | "unique_clicks")[];
  /** IANA name, e.g. "Asia/Kolkata". Defaults to UTC. */
  timezone?: string;
  /**
   * Dimension filters, `{dimension: [values]}`. Values are case-sensitive and
   * must match the stored capitalization exactly. `short_code` is not allowed
   * with `scope: "anon"`. Combinable with the per-dimension shortcuts below.
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

function buildStatsQuery(
  params: StatsParams,
): Record<string, string | number | undefined> {
  return {
    scope: params.scope,
    short_code: params.shortCode,
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
   * Aggregated click analytics. `scope: "all"` needs the `stats:read`,
   * `urls:read` or `admin:all` key scope. Rate limits: 60/min, 5,000/day
   * authenticated; 20/min, 1,000/day anonymous.
   */
  async get(params: StatsParams, opts?: RequestOptions): Promise<StatsResponse> {
    return this.transport.request(
      { method: "GET", path: "/api/v1/stats", query: buildStatsQuery(params) },
      opts,
    );
  }

  /**
   * Download the same analytics as a file. The `csv` format is a ZIP archive
   * (summary.csv plus one CSV per dimension), not a bare CSV. Export
   * generation is resource-intensive, so tighter limits apply: 30/min,
   * 1,000/day authenticated; 10/min, 200/day anonymous.
   */
  async export(
    params: StatsParams,
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
