/**
 * A link's id: the MongoDB ObjectId the management endpoints address it by.
 *
 * Branded so that an alias or short code cannot be passed where an id is
 * expected. The two live in different namespaces (`links.get(id)` vs
 * `links.getByAddress(domain, alias)`) and confusing them fails only at
 * runtime, with a 404 that looks like a missing link. The brand exists only
 * at compile time: at runtime a UrlId is a plain string and the wire shape
 * is unchanged.
 *
 * Ids returned by the SDK (`link.id`, claim results, per-link stats) already
 * carry the brand. For ids persisted as plain strings (a database, a config
 * file), cast with {@link asUrlId}.
 */
export type UrlId = string & { readonly __spooUrlId: unique symbol };

/**
 * Mark a plain string as a {@link UrlId}. A cast, not a validator: the
 * server remains the authority on whether the id resolves.
 */
export function asUrlId(id: string): UrlId {
  return id as UrlId;
}

/**
 * A tag's id, branded like {@link UrlId} and for the same reason: a tag id
 * and a tag name are both strings, and every input that takes ids sits next
 * to one that takes names (`tagIds` / `tagNames`, `tagId` / `tag`). Passing a
 * name where an id belongs fails only at runtime, as a 400 that reads like a
 * permissions problem. Ids returned by the SDK (`tag.id`, `link.tags[].id`)
 * carry the brand; for persisted plain strings, cast with {@link asTagId}.
 */
export type TagId = string & { readonly __spooTagId: unique symbol };

/** Mark a plain string as a {@link TagId}. A cast, not a validator. */
export function asTagId(id: string): TagId {
  return id as TagId;
}
