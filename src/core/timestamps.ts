/**
 * Timestamp normalization.
 *
 * The API mixes unix epoch seconds (UrlResponse, webhooks, API keys) and ISO
 * 8601 strings (UrlListItem, domains, app grants) in responses, and accepts
 * either in requests. The SDK accepts Date | string | number everywhere and
 * returns Date everywhere; the wire value is preserved on the raw payload.
 */

export type TimestampInput = Date | string | number;

/** Serialize a caller-supplied timestamp for the wire (ISO 8601). */
export function toWire(value: TimestampInput): string | number {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Parse a wire timestamp (epoch seconds or ISO string) into a Date. */
export function fromWire(value: string | number): Date;
export function fromWire(value: string | number | null | undefined): Date | undefined;
export function fromWire(
  value: string | number | null | undefined,
): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return new Date(value * 1000);
  return new Date(value);
}
