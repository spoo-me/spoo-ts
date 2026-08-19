import {
  Transport,
  type Fetch,
  type Logger,
  type RequestHooks,
  type RequestOptions,
} from "./core/http.js";
import { Links } from "./resources/links.js";
import { Stats } from "./resources/stats.js";
import { PublicLinks } from "./resources/public.js";
import { Emoji } from "./resources/emoji.js";
import { OAuth } from "./resources/oauth.js";
import { Auth } from "./resources/auth.js";

export interface SpooOptions {
  /**
   * API key (`spoo_...`). Defaults to the `SPOO_API_KEY` environment variable
   * on runtimes that expose one. Rides the `Authorization: Bearer` header.
   */
  apiKey?: string;
  /**
   * JWT or app token, static or as an (async) provider function. Mutually
   * exclusive with `apiKey`; the key wins if both are set.
   */
  token?: string | (() => string | Promise<string>);
  /** API origin. Override for self-hosted instances. Default `https://spoo.me`. */
  baseUrl?: string;
  /** Custom fetch implementation (proxies, instrumentation, tests). */
  fetch?: Fetch;
  /** Per-request timeout in milliseconds. Default 30 000. */
  timeout?: number;
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number;
  logger?: Logger;
  hooks?: RequestHooks;
  /**
   * X-Spoo-Client identity, e.g. "raycast/3.0.0". First-party apps built on
   * the SDK should set their own slug so traffic is attributed to the
   * product, not the SDK. Defaults to sdk-ts/<version>.
   */
  clientTag?: string;
  /**
   * Using an API key in a browser ships that key to every visitor. Set this
   * only when the key is scoped and you understand the exposure. Anonymous
   * (keyless) browser usage needs no flag.
   */
  dangerouslyAllowBrowser?: boolean;
}

export class Spoo {
  readonly links: Links;
  readonly stats: Stats;
  /** Public, unauthenticated per-link endpoints (stats page, preview). */
  readonly public: PublicLinks;
  readonly emoji: Emoji;
  /** Sign in with Spoo, client half: PKCE, code exchange, refreshing tokens. */
  readonly oauth: OAuth;
  readonly auth: Auth;

  /** @internal Transport shared by every resource namespace. */
  readonly _transport: Transport;

  constructor(options: SpooOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("SPOO_API_KEY");

    const baseUrl = (options.baseUrl ?? "https://spoo.me").replace(/\/+$/, "");

    if (apiKey !== undefined && isBrowser() && options.dangerouslyAllowBrowser !== true) {
      throw new Error(
        "Refusing to use an API key in a browser: it would be visible to every visitor. " +
          "Pass { dangerouslyAllowBrowser: true } if this is intentional, " +
          "or construct without a key for anonymous access.",
      );
    }

    this._transport = new Transport({
      baseUrl,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      ...(options.hooks !== undefined ? { hooks: options.hooks } : {}),
      ...(options.clientTag !== undefined ? { clientTag: options.clientTag } : {}),
    });

    this.links = new Links(this._transport, baseUrl);
    this.stats = new Stats(this._transport);
    this.public = new PublicLinks(this._transport);
    this.emoji = new Emoji(this._transport);
    this.oauth = new OAuth(this._transport, baseUrl);
    this.auth = new Auth(this._transport);
  }

  /**
   * Raw GET against any API path, through the configured transport: auth,
   * retries, timeout, client tag and error mapping all apply. The pressure
   * valve for endpoints the SDK does not cover yet; a call site here is a
   * signal worth filing an issue about.
   */
  async get<T>(path: string, query?: QueryParams, opts?: RequestOptions): Promise<T> {
    return this._transport.request<T>(
      { method: "GET", path, ...(query !== undefined ? { query } : {}) },
      opts,
    );
  }

  /** Raw POST with a JSON body. See {@link get} for what still applies. */
  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this._transport.request<T>(
      { method: "POST", path, ...(body !== undefined ? { body } : {}) },
      opts,
    );
  }

  /** Raw PATCH with a JSON body. See {@link get} for what still applies. */
  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this._transport.request<T>(
      { method: "PATCH", path, ...(body !== undefined ? { body } : {}) },
      opts,
    );
  }

  /** Raw DELETE. See {@link get} for what still applies. */
  async delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this._transport.request<T>({ method: "DELETE", path }, opts);
  }
}

/** Query parameters accepted by the raw request methods. */
export type QueryParams = Record<string, string | number | boolean | undefined>;

function readEnv(name: string): string | undefined {
  const proc = (globalThis as Record<string, unknown>)["process"] as
    | { env?: Record<string, string | undefined> }
    | undefined;
  return proc?.env?.[name];
}

function isBrowser(): boolean {
  const g = globalThis as Record<string, unknown>;
  return g["window"] !== undefined && g["document"] !== undefined;
}
