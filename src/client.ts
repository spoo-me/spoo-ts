import { Transport, type Fetch, type Logger, type RequestHooks } from "./core/http.js";
import { Links } from "./resources/links.js";
import { Stats } from "./resources/stats.js";
import { PublicLinks } from "./resources/public.js";
import { Emoji } from "./resources/emoji.js";
import { Misc } from "./resources/misc.js";
import { OAuth } from "./resources/oauth.js";

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
  /** Per-request timeout in milliseconds. Default 60 000. */
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
  readonly misc: Misc;
  /** Sign in with Spoo, client half: PKCE, code exchange, refreshing tokens. */
  readonly oauth: OAuth;

  /** @internal Transport shared by every resource namespace. */
  readonly _transport: Transport;

  constructor(options: SpooOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("SPOO_API_KEY");

    const baseUrl = options.baseUrl ?? "https://spoo.me";

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

    this.links = new Links(this._transport);
    this.stats = new Stats(this._transport);
    this.public = new PublicLinks(this._transport);
    this.emoji = new Emoji(this._transport);
    this.misc = new Misc(this._transport);
    this.oauth = new OAuth(this._transport, baseUrl.replace(/\/+$/, ""));
  }
}

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
