import type { components } from "../generated/schema.js";
import type { Transport, RequestOptions } from "../core/http.js";
import { APIError, SessionExpiredError } from "../core/errors.js";
import { decodeJwtPayload } from "../core/pkce.js";

type Schemas = components["schemas"];

export type DeviceTokens = Schemas["DeviceTokenResponse"];
export type RefreshedTokens = Schemas["DeviceRefreshResponse"];

export interface AuthorizationUrlParams {
  /** Your app's id from the spoo.me connected-apps registry. */
  appId: string;
  /**
   * Must exactly match the redirect URI registered for the app; the server
   * rejects everything else, including a different port.
   */
  redirectUri: string;
  /** CSRF-binding state echoed back on the callback. See `generateState()`. */
  state: string;
  /** The S256 challenge from `generatePkcePair()`. */
  codeChallenge: string;
}

export interface TokenProviderOptions {
  /** Current token pair, e.g. from the initial code exchange or app storage. */
  tokens: { access_token: string; refresh_token: string };
  /**
   * Called after every successful refresh with the ROTATED pair. Persist it:
   * the previous refresh token is dead the moment this fires.
   */
  onRefresh?: (tokens: RefreshedTokens) => void | Promise<void>;
  /** Seconds before `exp` to refresh proactively. Default 30. */
  expirySkew?: number;
}

/**
 * The client half of Sign in with Spoo (authorization-code + PKCE). The SDK
 * never opens browsers, renders consent, or stores secrets; it provides the
 * protocol pieces and a self-refreshing credential for `new Spoo({ token })`.
 */
export class OAuth {
  constructor(
    private readonly transport: Transport,
    private readonly baseUrl: string,
  ) {}

  /** The consent-page URL your app opens in a browser. S256 is mandatory. */
  authorizationUrl(params: AuthorizationUrlParams): string {
    const url = new URL(this.baseUrl + "/auth/device/login");
    url.searchParams.set("app_id", params.appId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  /**
   * Exchange the one-time code from the callback for tokens. The code and
   * verifier are the credentials; no auth header is involved.
   */
  async exchangeCode(
    params: { code: string; codeVerifier: string },
    opts?: RequestOptions,
  ): Promise<DeviceTokens> {
    return this.transport.request(
      {
        method: "POST",
        path: "/auth/device/token",
        body: { code: params.code, code_verifier: params.codeVerifier },
      },
      opts,
    );
  }

  /**
   * Trade a refresh token for a fresh pair. Refresh tokens rotate: the one
   * you sent is invalid afterwards, and grant scope changes propagate here.
   * Prefer `tokenProvider`, which handles rotation and persistence for you.
   */
  async refreshTokens(refreshToken: string, opts?: RequestOptions): Promise<RefreshedTokens> {
    try {
      return await this.transport.request(
        {
          method: "POST",
          path: "/auth/device/refresh",
          body: { refresh_token: refreshToken },
        },
        opts,
      );
    } catch (err) {
      if (err instanceof APIError && (err.status === 401 || err.status === 400)) {
        throw new SessionExpiredError({ cause: err });
      }
      throw err;
    }
  }

  /**
   * A self-refreshing credential for `new Spoo({ token })`. Refreshes
   * proactively before the access token's `exp`, single-flight (concurrent
   * calls share one refresh, so a rotated pair is never persisted twice),
   * and reports every rotation through `onRefresh` for storage.
   *
   * Throws `SessionExpiredError` from the pending call when the refresh
   * token is rejected; catch it to send the user back through login.
   */
  tokenProvider(options: TokenProviderOptions): () => Promise<string> {
    const skewMs = (options.expirySkew ?? 30) * 1000;
    let access = options.tokens.access_token;
    let refresh = options.tokens.refresh_token;
    let expiresAt = readExpiry(access);
    let inflight: Promise<void> | undefined;

    const doRefresh = async (): Promise<void> => {
      const next = await this.refreshTokens(refresh);
      access = next.access_token;
      refresh = next.refresh_token;
      expiresAt = readExpiry(access);
      await options.onRefresh?.(next);
    };

    return async () => {
      if (expiresAt === undefined || Date.now() < expiresAt - skewMs) {
        return access;
      }
      inflight ??= doRefresh().finally(() => {
        inflight = undefined;
      });
      await inflight;
      return access;
    };
  }
}

function readExpiry(accessToken: string): number | undefined {
  const exp = decodeJwtPayload(accessToken)?.["exp"];
  return typeof exp === "number" ? exp * 1000 : undefined;
}
