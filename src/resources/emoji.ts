import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { APIError } from "../core/errors.js";

type Schemas = components["schemas"];

export type EmojiSet = Schemas["EmojiSetResponse"];
export type EmojiEntry = Schemas["EmojiEntry"];

export class Emoji {
  /** ETag of the last successfully fetched set, revalidated on the next call. */
  private lastEtag: string | undefined = undefined;
  private lastSet: EmojiSet | undefined = undefined;

  constructor(private readonly transport: Transport) {}

  /**
   * The accepted emoji-alias catalogue and its policy caps. No auth; the
   * response is identical for everyone. Rate limits: 60/min, 2,000/day.
   *
   * Emoji characters are raw and canonical (no U+FE0F variation selector),
   * matching how aliases are stored and echoed. Skin-tone variants are not
   * enumerated — skin tone is a client-side modifier on the base emoji.
   *
   * The instance revalidates with `If-None-Match`: a repeat call while the
   * set is unchanged costs a 304 on the wire and returns the cached body.
   */
  async getSet(opts?: RequestOptions): Promise<EmojiSet> {
    const headers = {
      ...opts?.headers,
      ...(this.lastEtag !== undefined && this.lastSet !== undefined
        ? { "If-None-Match": this.lastEtag }
        : {}),
    };
    try {
      const { data, meta } = await this.transport.requestWithMeta<EmojiSet>(
        { method: "GET", path: "/api/v1/emoji-set" },
        { ...opts, headers },
      );
      const etag = meta.headers.get("etag");
      this.lastEtag = etag ?? undefined;
      this.lastSet = etag !== null ? data : undefined;
      return data;
    } catch (err) {
      // 304 Not Modified is not `response.ok`, so the transport surfaces it
      // as an APIError. Catching it here is the least invasive handling: the
      // core stays untouched, at the cost of the onError hook seeing the 304.
      if (err instanceof APIError && err.status === 304 && this.lastSet !== undefined) {
        return this.lastSet;
      }
      throw err;
    }
  }
}
