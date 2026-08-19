/**
 * HTTP transport: auth, retries, timeouts, error mapping.
 *
 * Built on global `fetch` only, so the same code runs on Node 20+, Cloudflare
 * Workers, Vercel Edge, Deno, Bun and browsers.
 */

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  apiErrorFromResponse,
  parseRateLimitHeaders,
  type RateLimitInfo,
} from "./errors.js";
import { SDK_VERSION } from "../version.js";

export { SDK_VERSION };

export type Fetch = typeof fetch;

export interface Logger {
  debug(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
}

export interface RequestHooks {
  /** Called with the assembled Request before it is sent (including retries). */
  beforeRequest?: (request: Request) => void | Promise<void>;
  /** Called with every non-error Response before it is parsed. */
  afterResponse?: (response: Response) => void | Promise<void>;
  /** Called with every error the transport is about to throw. */
  onError?: (error: unknown) => void | Promise<void>;
}

export interface TransportOptions {
  baseUrl: string;
  apiKey?: string;
  token?: string | (() => string | Promise<string>);
  fetch?: Fetch;
  /** Per-request timeout in milliseconds. Default 30 000. */
  timeout?: number;
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number;
  logger?: Logger;
  hooks?: RequestHooks;
  /** Client slug appended to X-Spoo-Client, e.g. "raycast". Defaults to the SDK's own. */
  clientTag?: string;
}

/** Options accepted by every resource method as a trailing argument. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface RequestSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** How to read the response. Default "json". */
  responseAs?: "json" | "blob" | "none";
}

/** Metadata available on every successful call via `withResponse` variants. */
export interface ResponseMeta {
  requestId?: string;
  rateLimit: RateLimitInfo;
  status: number;
  headers: Headers;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE"]);

export class Transport {
  private readonly options: TransportOptions;
  private readonly fetchFn: Fetch;

  constructor(options: TransportOptions) {
    this.options = options;
    // Bind to globalThis: bare `fetch` loses its receiver when stored.
    this.fetchFn = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  async request<T>(spec: RequestSpec, opts: RequestOptions = {}): Promise<T> {
    const { data } = await this.requestWithMeta<T>(spec, opts);
    return data;
  }

  async requestWithMeta<T>(
    spec: RequestSpec,
    opts: RequestOptions = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    const maxRetries = opts.maxRetries ?? this.options.maxRetries ?? 2;
    let attempt = 0;

    for (;;) {
      try {
        const response = await this.sendOnce(spec, opts);
        if (response.ok) {
          await this.options.hooks?.afterResponse?.(response);
          const meta: ResponseMeta = {
            rateLimit: parseRateLimitHeaders(response.headers),
            status: response.status,
            headers: response.headers,
          };
          const requestId = response.headers.get("x-request-id");
          if (requestId !== null) meta.requestId = requestId;
          return { data: await this.parseBody<T>(response, spec), meta };
        }

        const error = apiErrorFromResponse(
          response.status,
          await parseErrorPayload(response),
          response.headers,
        );
        if (attempt < maxRetries && this.shouldRetry(spec, response.status)) {
          attempt += 1;
          await this.backoff(attempt, response.headers, spec.path);
          continue;
        }
        await this.options.hooks?.onError?.(error);
        throw error;
      } catch (err) {
        if (err instanceof APIError) throw err;
        const connError = toConnectionError(err, opts.signal);
        // A caller abort is not the transport's failure to retry.
        const callerAborted = opts.signal?.aborted === true;
        if (
          !callerAborted &&
          attempt < maxRetries &&
          IDEMPOTENT_METHODS.has(spec.method)
        ) {
          attempt += 1;
          await this.backoff(attempt, undefined, spec.path);
          continue;
        }
        await this.options.hooks?.onError?.(connError);
        throw connError;
      }
    }
  }

  private async sendOnce(spec: RequestSpec, opts: RequestOptions): Promise<Response> {
    const url = this.buildUrl(spec);
    const headers = new Headers(opts.headers);
    headers.set("Accept", "application/json");
    if (!headers.has("X-Spoo-Client")) {
      headers.set(
        "X-Spoo-Client",
        this.options.clientTag ?? `sdk-ts/${SDK_VERSION}`,
      );
    }

    const auth = await this.resolveAuth();
    if (auth !== undefined && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${auth}`);
    }

    let body: string | undefined;
    if (spec.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(spec.body);
    }

    const timeout = opts.timeout ?? this.options.timeout ?? 30_000;
    const timeoutSignal = AbortSignal.timeout(timeout);
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal;

    const request = new Request(url, {
      method: spec.method,
      headers,
      signal,
      ...(body !== undefined ? { body } : {}),
    });
    this.options.logger?.debug(`spoo.me ${spec.method} ${spec.path}`);
    await this.options.hooks?.beforeRequest?.(request);
    return this.fetchFn(request);
  }

  private buildUrl(spec: RequestSpec): string {
    const base = this.options.baseUrl.replace(/\/+$/, "");
    const url = new URL(base + spec.path);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async resolveAuth(): Promise<string | undefined> {
    const { apiKey, token } = this.options;
    if (apiKey !== undefined) return apiKey;
    if (typeof token === "function") return token();
    return token;
  }

  private shouldRetry(spec: RequestSpec, status: number): boolean {
    if (!RETRYABLE_STATUSES.has(status)) return false;
    // Non-idempotent mutations only retry on statuses where the server
    // provably did no work. The API has no Idempotency-Key support yet.
    if (!IDEMPOTENT_METHODS.has(spec.method)) return status === 429 || status === 503;
    return true;
  }

  private async backoff(
    attempt: number,
    headers: Headers | undefined,
    path: string,
  ): Promise<void> {
    let delayMs: number;
    const retryAfter = headers?.get("retry-after");
    if (retryAfter !== null && retryAfter !== undefined && /^\d+$/.test(retryAfter)) {
      delayMs = Number(retryAfter) * 1000;
    } else {
      // Jittered exponential backoff: 0.5s, 1s, 2s ... capped at 8s.
      const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
      delayMs = base * (0.5 + Math.random() * 0.5);
    }
    this.options.logger?.warn(
      `spoo.me retrying ${path} (attempt ${attempt}) in ${Math.round(delayMs)}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async parseBody<T>(response: Response, spec: RequestSpec): Promise<T> {
    switch (spec.responseAs ?? "json") {
      case "none":
        return undefined as T;
      case "blob":
        return (await response.blob()) as T;
      case "json": {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }
    }
  }
}

async function parseErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toConnectionError(err: unknown, signal?: AbortSignal): APIConnectionError {
  if (err instanceof Error && err.name === "TimeoutError") {
    return new APITimeoutError();
  }
  if (err instanceof Error && err.name === "AbortError" && signal?.aborted) {
    return new APIConnectionError("Request aborted", { cause: err });
  }
  return new APIConnectionError("Connection error", { cause: err });
}
