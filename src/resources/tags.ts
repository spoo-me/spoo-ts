import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { fromWire } from "../core/timestamps.js";
import { asTagId, type TagId } from "../core/ids.js";

type Schemas = components["schemas"];

/**
 * Palette key; the dashboard maps each to a muted dot color. The set may
 * grow, so a `Record<TagColor, ...>` in consumer code wants a fallback.
 */
export type TagColor = Schemas["TagColor"];

/**
 * Icon key from the curated set (lucide names). The set may grow, so a
 * `Record<TagIcon, ...>` in consumer code wants a fallback.
 */
export type TagIcon = Schemas["TagIcon"];

/** A tag as it appears on a link: enough to render, no counts. Id branded. */
export interface TagRef extends Omit<Schemas["TagRef"], "id"> {
  id: TagId;
}

/** A tag from its own endpoints, with its link count, timestamps parsed to Date. */
export interface Tag extends Omit<Schemas["TagResponse"], "id" | "created_at" | "updated_at"> {
  id: TagId;
  created_at: Date;
  updated_at?: Date | null | undefined;
}

export function brandTagRef(raw: Schemas["TagRef"]): TagRef {
  return { ...raw, id: asTagId(raw.id) };
}

export interface CreateTagParams extends Omit<Schemas["CreateTagRequest"], "icon"> {
  /**
   * Optional here even though codegen marks it required: the API defaults it
   * to "tag" (openapi-typescript treats defaulted fields as non-optional).
   */
  icon?: TagIcon;
}

/**
 * Rename, recolor or change the icon. Omitted fields are left as they are.
 * Non-null on purpose: the server treats `null` the same as omitted, so
 * `color: null` does not re-pick a color the way omitting it on create does.
 */
export type UpdateTagParams = {
  [K in keyof Schemas["UpdateTagRequest"]]?: NonNullable<Schemas["UpdateTagRequest"][K]>;
};

export type DeleteTagResult = Schemas["TagDeleteResponse"];

function parseTag(raw: Schemas["TagResponse"]): Tag {
  return {
    ...raw,
    id: asTagId(raw.id),
    created_at: fromWire(raw.created_at),
    updated_at: raw.updated_at != null ? fromWire(raw.updated_at) : raw.updated_at,
  };
}

/**
 * Tags are labels you attach to links, at most 10 per link and 500 per
 * account. Links reference tags by id, so renaming one shows up everywhere
 * at once. Tag a link with `tag_ids` on `links.create` and `links.update`,
 * or many at a time with `links.bulk.updateTags`.
 */
export class Tags {
  constructor(private readonly transport: Transport) {}

  /** Every tag in your account with its link count, oldest first. */
  async list(opts?: RequestOptions): Promise<Tag[]> {
    const raw = await this.transport.request<Schemas["TagListResponse"]>(
      { method: "GET", path: "/api/v1/tags" },
      opts,
    );
    return raw.items.map(parseTag);
  }

  /**
   * Create a tag. Names are lowercased and trimmed; a name you already have
   * fails as `ConflictError`. Omit `color` to get the least-used palette
   * color in your account.
   */
  async create(params: CreateTagParams, opts?: RequestOptions): Promise<Tag> {
    const raw = await this.transport.request<Schemas["TagResponse"]>(
      { method: "POST", path: "/api/v1/tags", body: params },
      opts,
    );
    return parseTag(raw);
  }

  /** Change the name, color or icon. Renaming onto a name you already have fails as `ConflictError`. */
  async update(tagId: TagId, params: UpdateTagParams, opts?: RequestOptions): Promise<Tag> {
    const raw = await this.transport.request<Schemas["TagResponse"]>(
      { method: "PATCH", path: `/api/v1/tags/${encodeURIComponent(tagId)}`, body: params },
      opts,
    );
    return parseTag(raw);
  }

  /**
   * Delete the tag and remove it from every link that carried it; the links
   * themselves are untouched. Rate limited like bulk delete: 10/min.
   */
  async delete(tagId: TagId, opts?: RequestOptions): Promise<DeleteTagResult> {
    return this.transport.request(
      { method: "DELETE", path: `/api/v1/tags/${encodeURIComponent(tagId)}` },
      opts,
    );
  }
}
