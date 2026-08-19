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
