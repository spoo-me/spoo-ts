import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";

type Schemas = components["schemas"];

export type UserProfile = Schemas["UserProfileResponse"];

export class Auth {
  constructor(private readonly transport: Transport) {}

  /**
   * The authenticated identity. Works with both API keys and connected-app
   * tokens; anonymous clients get a 401.
   */
  async me(opts?: RequestOptions): Promise<UserProfile> {
    const raw = await this.transport.request<Schemas["MeResponse"]>(
      { method: "GET", path: "/auth/me" },
      opts,
    );
    return raw.user;
  }
}
