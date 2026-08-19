import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { Page } from "../core/page.js";
import { fromWire, toWire, type TimestampInput } from "../core/timestamps.js";
import { asUrlId, type UrlId } from "../core/ids.js";

type Schemas = components["schemas"];

/** A link as returned by the management endpoints, timestamps parsed to Date. */
export interface Link
  extends Omit<
    Schemas["UrlListItem"],
    "id" | "created_at" | "last_click" | "expire_after"
  > {
  id: UrlId;
  /** Derived client-side from alias + domain; the list payload does not carry it. */
  short_url?: string;
  created_at?: Date | null | undefined;
  last_click?: Date | null | undefined;
  expire_after?: Date | null | undefined;
}

/** A freshly created link, timestamps parsed to Date. */
export interface CreatedLink extends Omit<Schemas["UrlResponse"], "id" | "created_at"> {
  id: UrlId;
  created_at: Date;
}

/** Response to an update or status change; the wire shape with a branded id. */
export interface UpdateLinkResult extends Omit<Schemas["UpdateUrlResponse"], "id"> {
  id: UrlId;
}

/** Response to a single-link delete; the wire shape with a branded id. */
export interface DeleteLinkResult extends Omit<Schemas["DeleteUrlResponse"], "id"> {
  id: UrlId;
}

/** Per-item outcome of a claim batch, id branded. */
export interface ClaimResultEntry extends Omit<Schemas["ClaimResultItem"], "url_id"> {
  url_id: UrlId;
}

/** Outcome of a claim batch; every submitted item gets a result. */
export interface ClaimLinksResult extends Omit<Schemas["ClaimUrlsResponse"], "results"> {
  results: ClaimResultEntry[];
}

export interface CreateLinkParams
  extends Omit<Schemas["CreateUrlRequest"], "expire_after" | "alias_type"> {
  /** Expiry as Date, ISO 8601 string, or unix epoch seconds. */
  expire_after?: TimestampInput | null;
  /**
   * Optional here even though codegen marks it required: the API defaults it
   * to "alphanumeric" (openapi-typescript treats defaulted fields as
   * non-optional).
   */
  alias_type?: Schemas["CreateUrlRequest"]["alias_type"];
}

export interface UpdateLinkParams
  extends Omit<Schemas["UpdateUrlRequest"], "expire_after"> {
  expire_after?: TimestampInput | null;
}

export interface ListLinksParams {
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "last_click" | "total_clicks";
  sortOrder?: "ascending" | "descending";
  /** Structured filter; serialized to the API's JSON filter parameter. */
  filter?: {
    status?: Schemas["UrlStatus"];
    createdAfter?: TimestampInput;
    createdBefore?: TimestampInput;
    passwordSet?: boolean;
    maxClicksSet?: boolean;
    search?: string;
  };
  domain?: string;
}

export interface ClaimItem {
  urlId: UrlId;
  /** The one-time claim token returned by the anonymous shorten call. */
  claimToken: string;
}

/** Per-item verdict of a bulk operation, id branded. */
export interface BulkResultRow extends Omit<Schemas["BulkUrlResultRow"], "id"> {
  id: UrlId;
}

/** Outcome of a bulk operation: a summary plus one row per requested id. */
export interface BulkResult
  extends Omit<Schemas["BulkUrlOperationResponse"], "results"> {
  results: BulkResultRow[];
}

function parseListItem(item: Schemas["UrlListItem"], baseUrl: string): Link {
  const origin = item.domain != null ? `https://${item.domain}` : baseUrl;
  return {
    ...item,
    id: asUrlId(item.id),
    ...(item.alias != null ? { short_url: `${origin}/${item.alias}` } : {}),
    created_at: item.created_at != null ? fromWire(item.created_at) : item.created_at,
    last_click: item.last_click != null ? fromWire(item.last_click) : item.last_click,
    expire_after:
      item.expire_after != null ? fromWire(item.expire_after) : item.expire_after,
  };
}

export class Links {
  readonly bulk: LinksBulk;

  constructor(
    private readonly transport: Transport,
    private readonly baseUrl: string,
  ) {
    this.bulk = new LinksBulk(transport);
  }

  /**
   * Shorten a URL. Works unauthenticated; anonymous calls return a one-time
   * `claim_token` for later account claiming. `domain`, `geo_rules` and
   * `meta_tags` require a verified account with the matching feature
   * enabled, and fail as `feature_disabled` otherwise.
   */
  async create(params: CreateLinkParams, opts?: RequestOptions): Promise<CreatedLink> {
    const body = {
      ...params,
      ...(params.expire_after != null
        ? { expire_after: toWire(params.expire_after) }
        : {}),
    };
    const raw = await this.transport.request<Schemas["UrlResponse"]>(
      { method: "POST", path: "/api/v1/shorten", body },
      opts,
    );
    return { ...raw, id: asUrlId(raw.id), created_at: fromWire(raw.created_at) };
  }

  /** Check whether an alias is free before trying to create it. */
  async checkAlias(
    alias: string,
    params?: { domain?: string },
    opts?: RequestOptions,
  ): Promise<Schemas["AliasCheckResponse"]> {
    return this.transport.request(
      {
        method: "GET",
        path: "/api/v1/shorten/check-alias",
        query: { alias, domain: params?.domain },
      },
      opts,
    );
  }

  /** List your links. The returned Page is `for await`-iterable across all pages. */
  async list(params: ListLinksParams = {}, opts?: RequestOptions): Promise<Page<Link>> {
    const fetchPage = async (page: number) => {
      const query: Record<string, string | number | undefined> = {
        page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        domain: params.domain,
      };
      if (params.filter !== undefined) {
        const filter = { ...params.filter } as Record<string, unknown>;
        if (params.filter.createdAfter !== undefined) {
          filter["createdAfter"] = toWire(params.filter.createdAfter);
        }
        if (params.filter.createdBefore !== undefined) {
          filter["createdBefore"] = toWire(params.filter.createdBefore);
        }
        query["filter"] = JSON.stringify(filter);
      }
      const raw = await this.transport.request<Schemas["UrlListResponse"]>(
        { method: "GET", path: "/api/v1/urls", query },
        opts,
      );
      return {
        items: raw.items.map((i) => parseListItem(i, this.baseUrl)),
        total: raw.total,
        hasNext: raw.hasNext,
      };
    };
    const first = params.page ?? 1;
    return new Page(await fetchPage(first), first, fetchPage);
  }

  /** Fetch one of your links by its id. */
  async get(urlId: UrlId, opts?: RequestOptions): Promise<Link> {
    const raw = await this.transport.request<Schemas["UrlListItem"]>(
      { method: "GET", path: `/api/v1/urls/${encodeURIComponent(urlId)}` },
      opts,
    );
    return parseListItem(raw, this.baseUrl);
  }

  /**
   * Fetch one of your links by domain + alias. Pass `"spoo.me"` as the domain
   * for links on the default namespace. Emoji aliases are percent-encoded
   * automatically.
   */
  async getByAddress(domain: string, alias: string, opts?: RequestOptions): Promise<Link> {
    const raw = await this.transport.request<Schemas["UrlListItem"]>(
      {
        method: "GET",
        path: `/api/v1/urls/${encodeURIComponent(domain)}/${encodeURIComponent(alias)}`,
      },
      opts,
    );
    return parseListItem(raw, this.baseUrl);
  }

  async update(
    urlId: UrlId,
    params: UpdateLinkParams,
    opts?: RequestOptions,
  ): Promise<UpdateLinkResult> {
    const body = {
      ...params,
      ...(params.expire_after != null
        ? { expire_after: toWire(params.expire_after) }
        : {}),
    };
    return this.transport.request(
      { method: "PATCH", path: `/api/v1/urls/${encodeURIComponent(urlId)}`, body },
      opts,
    );
  }

  async setStatus(
    urlId: UrlId,
    status: "ACTIVE" | "INACTIVE",
    opts?: RequestOptions,
  ): Promise<UpdateLinkResult> {
    return this.transport.request(
      {
        method: "PATCH",
        path: `/api/v1/urls/${encodeURIComponent(urlId)}/status`,
        body: { status },
      },
      opts,
    );
  }

  async delete(urlId: UrlId, opts?: RequestOptions): Promise<DeleteLinkResult> {
    return this.transport.request(
      { method: "DELETE", path: `/api/v1/urls/${encodeURIComponent(urlId)}` },
      opts,
    );
  }

  /** Delete every link on one of your custom domains. Refuses the default domain. */
  async deleteByDomain(
    domain: string,
    opts?: RequestOptions,
  ): Promise<Schemas["BulkDeleteUrlsResponse"]> {
    return this.transport.request(
      { method: "DELETE", path: "/api/v1/urls", query: { domain } },
      opts,
    );
  }

  /**
   * Claim anonymously-created links into the authenticated account using the
   * one-time claim tokens from `create`. Up to 16 per call; items resolve
   * independently and the call never throws on per-item failures.
   */
  async claim(
    claims: ClaimItem[],
    opts?: RequestOptions,
  ): Promise<ClaimLinksResult> {
    // Typed against the generated schema so a wire-shape drift is a compile
    // error, not a runtime 422 (0.6.0 and earlier sent a wrong field name).
    const body: Schemas["ClaimUrlsRequest"] = {
      claims: claims.map((c) => ({ url_id: c.urlId, token: c.claimToken })),
    };
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/claim", body },
      opts,
    );
  }
}

/**
 * Bulk operations on up to 100 links at a time. All return per-item results
 * with a summary; the HTTP call succeeds even when every item fails, so
 * check `summary.failed`.
 */
export class LinksBulk {
  constructor(private readonly transport: Transport) {}

  async delete(ids: UrlId[], opts?: RequestOptions): Promise<BulkResult> {
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/bulk/delete", body: { ids } },
      opts,
    );
  }

  async setStatus(
    ids: UrlId[],
    status: "ACTIVE" | "INACTIVE",
    opts?: RequestOptions,
  ): Promise<BulkResult> {
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/bulk/status", body: { ids, status } },
      opts,
    );
  }

  /** Set or clear (null) expiry on many links. The expiry must be in the future. */
  async setExpiry(
    ids: UrlId[],
    expireAfter: TimestampInput | null,
    opts?: RequestOptions,
  ): Promise<BulkResult> {
    return this.transport.request(
      {
        method: "POST",
        path: "/api/v1/urls/bulk/expiry",
        body: { ids, expire_after: expireAfter === null ? null : toWire(expireAfter) },
      },
      opts,
    );
  }

  /** Move many links onto a custom domain, or back to the default with null. */
  async setDomain(
    ids: UrlId[],
    domain: string | null,
    opts?: RequestOptions,
  ): Promise<BulkResult> {
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/bulk/domain", body: { ids, domain } },
      opts,
    );
  }
}
