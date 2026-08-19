import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { fromWire } from "../core/timestamps.js";

type Schemas = components["schemas"];

/** An API key's metadata, timestamps parsed to Date. The token itself is
 * only ever visible in the dashboard at creation time. */
export interface ApiKey
  extends Omit<Schemas["ApiKeyResponse"], "created_at" | "expires_at" | "last_used_at"> {
  created_at?: Date | null | undefined;
  expires_at?: Date | null | undefined;
  last_used_at?: Date | null | undefined;
}

/**
 * API-key management. Requires an interactive session or a connected-app
 * token with the keys:manage scope; API keys themselves are refused by the
 * server (a key cannot manage keys). Creation is dashboard-only.
 */
export class Keys {
  constructor(private readonly transport: Transport) {}

  async list(opts?: RequestOptions): Promise<ApiKey[]> {
    const raw = await this.transport.request<Schemas["ApiKeysListResponse"]>(
      { method: "GET", path: "/api/v1/keys" },
      opts,
    );
    return raw.keys.map((k) => ({
      ...k,
      created_at: k.created_at != null ? fromWire(k.created_at) : k.created_at,
      expires_at: k.expires_at != null ? fromWire(k.expires_at) : k.expires_at,
      last_used_at: k.last_used_at != null ? fromWire(k.last_used_at) : k.last_used_at,
    }));
  }

  /** Delete a key permanently, or pass `revoke: true` to keep a revoked stub. */
  async delete(
    keyId: string,
    params?: { revoke?: boolean },
    opts?: RequestOptions,
  ): Promise<Schemas["ApiKeyActionResponse"]> {
    return this.transport.request(
      {
        method: "DELETE",
        path: `/api/v1/keys/${encodeURIComponent(keyId)}`,
        query: { revoke: params?.revoke },
      },
      opts,
    );
  }
}
