import { Transport, type Fetch, type Logger, type RequestHooks } from "./core/http.js";
import { Links } from "./resources/links.js";

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
   * Using an API key in a browser ships that key to every visitor. Set this
   * only when the key is scoped and you understand the exposure. Anonymous
   * (keyless) browser usage needs no flag.
   */
  dangerouslyAllowBrowser?: boolean;
}

export class Spoo {
  readonly links: Links;

  /** @internal Transport shared by every resource namespace. */
  readonly _transport: Transport;

  constructor(options: SpooOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("SPOO_API_KEY");

    if (apiKey !== undefined && isBrowser() && options.dangerouslyAllowBrowser !== true) {
      throw new Error(
        "Refusing to use an API key in a browser: it would be visible to every visitor. " +
          "Pass { dangerouslyAllowBrowser: true } if this is intentional, " +
          "or construct without a key for anonymous access.",
      );
    }

    this._transport = new Transport({
      baseUrl: options.baseUrl ?? "https://spoo.me",
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      ...(options.hooks !== undefined ? { hooks: options.hooks } : {}),
    });

    this.links = new Links(this._transport);
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
