import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { Page } from "../core/page.js";
import { fromWire, toWire, type TimestampInput } from "../core/timestamps.js";

type Schemas = components["schemas"];

/** A link as returned by the management endpoints, timestamps parsed to Date. */
export interface Link
  extends Omit<Schemas["UrlListItem"], "created_at" | "last_click" | "expire_after"> {
  created_at?: Date | null | undefined;
  last_click?: Date | null | undefined;
  expire_after?: Date | null | undefined;
}

/** A freshly created link, timestamps parsed to Date. */
export interface CreatedLink extends Omit<Schemas["UrlResponse"], "created_at"> {
  created_at: Date;
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
  urlId: string;
  /** The one-time claim token returned by the anonymous shorten call. */
  claimToken: string;
}

export type BulkResult = Schemas["BulkUrlOperationResponse"];

function parseListItem(item: Schemas["UrlListItem"]): Link {
  return {
    ...item,
    created_at: item.created_at != null ? fromWire(item.created_at) : item.created_at,
    last_click: item.last_click != null ? fromWire(item.last_click) : item.last_click,
    expire_after:
      item.expire_after != null ? fromWire(item.expire_after) : item.expire_after,
  };
}

export class Links {
  readonly bulk: LinksBulk;

  constructor(private readonly transport: Transport) {
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
    return { ...raw, created_at: fromWire(raw.created_at) };
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
        items: raw.items.map(parseListItem),
        total: raw.total,
        hasNext: raw.hasNext,
      };
    };
    const first = params.page ?? 1;
    return new Page(await fetchPage(first), first, fetchPage);
  }

  /** Fetch one of your links by its id. */
  async get(urlId: string, opts?: RequestOptions): Promise<Link> {
    const raw = await this.transport.request<Schemas["UrlListItem"]>(
      { method: "GET", path: `/api/v1/urls/${encodeURIComponent(urlId)}` },
      opts,
    );
    return parseListItem(raw);
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
    return parseListItem(raw);
  }

  async update(
    urlId: string,
    params: UpdateLinkParams,
    opts?: RequestOptions,
  ): Promise<Schemas["UpdateUrlResponse"]> {
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
    urlId: string,
    status: "ACTIVE" | "INACTIVE",
    opts?: RequestOptions,
  ): Promise<Schemas["UpdateUrlResponse"]> {
    return this.transport.request(
      {
        method: "PATCH",
        path: `/api/v1/urls/${encodeURIComponent(urlId)}/status`,
        body: { status },
      },
      opts,
    );
  }

  async delete(urlId: string, opts?: RequestOptions): Promise<Schemas["DeleteUrlResponse"]> {
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
   * one-time claim tokens from `create`. Items resolve independently; the
   * call never throws on per-item failures.
   */
  async claim(
    claims: ClaimItem[],
    opts?: RequestOptions,
  ): Promise<Schemas["ClaimUrlsResponse"]> {
    return this.transport.request(
      {
        method: "POST",
        path: "/api/v1/urls/claim",
        body: {
          claims: claims.map((c) => ({ url_id: c.urlId, claim_token: c.claimToken })),
        },
      },
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

  async delete(ids: string[], opts?: RequestOptions): Promise<BulkResult> {
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/bulk/delete", body: { ids } },
      opts,
    );
  }

  async setStatus(
    ids: string[],
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
    ids: string[],
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
    ids: string[],
    domain: string | null,
    opts?: RequestOptions,
  ): Promise<BulkResult> {
    return this.transport.request(
      { method: "POST", path: "/api/v1/urls/bulk/domain", body: { ids, domain } },
      opts,
    );
  }
}
