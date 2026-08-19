export { Spoo, type SpooOptions } from "./client.js";
export {
  SpooError,
  APIError,
  APIConnectionError,
  APITimeoutError,
  BadRequestError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  PayloadTooLargeError,
  ValidationError,
  RateLimitError,
  SessionExpiredError,
  ContentBlockedError,
  InternalServerError,
  ServiceUnavailableError,
  type SpooErrorCode,
  type SpooErrorBody,
  type RateLimitInfo,
} from "./core/errors.js";
export { Page } from "./core/page.js";
export { SDK_VERSION, type RequestOptions, type ResponseMeta } from "./core/http.js";
export type { TimestampInput } from "./core/timestamps.js";
export {
  Links,
  LinksBulk,
  type Link,
  type CreatedLink,
  type CreateLinkParams,
  type UpdateLinkParams,
  type ListLinksParams,
  type ClaimItem,
  type BulkResult,
} from "./resources/links.js";
export {
  Stats,
  type StatsParams,
  type AggregateStatsParams,
  type LinkStatsResponse,
  type StatsResponse,
  type StatsDataPoint,
  type StatsExport,
  type StatsExportFormat,
} from "./resources/stats.js";
export {
  PublicLinks,
  type PublicStatsOptions,
  type PublicStatsResponse,
  type PublicPreviewResponse,
} from "./resources/public.js";
export { Emoji, type EmojiSet, type EmojiEntry } from "./resources/emoji.js";
export {
  OAuth,
  type DeviceTokens,
  type RefreshedTokens,
  type AuthorizationUrlParams,
  type TokenProvider,
  type TokenProviderOptions,
} from "./resources/oauth.js";
export { generatePkcePair, generateState, decodeJwtPayload, type PkcePair } from "./core/pkce.js";
export { Auth, type UserProfile } from "./resources/auth.js";
export type { components as ApiSchema } from "./generated/schema.js";
