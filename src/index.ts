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
export type { components as ApiSchema } from "./generated/schema.js";
