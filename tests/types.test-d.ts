import { expectTypeOf, test } from "vitest";
import type {
  EmojiSet,
  HealthStatus,
  Link,
  CreatedLink,
  PublicPreviewResponse,
  StatsDataPoint,
  StatsExport,
  StatsResponse,
} from "../src/index.js";

test("Link timestamps are parsed to Date", () => {
  expectTypeOf<Link["created_at"]>().toEqualTypeOf<Date | null | undefined>();
  expectTypeOf<Link["last_click"]>().toEqualTypeOf<Date | null | undefined>();
  expectTypeOf<Link["expire_after"]>().toEqualTypeOf<Date | null | undefined>();
  expectTypeOf<CreatedLink["created_at"]>().toEqualTypeOf<Date>();
});

test("StatsResponse metrics is a dynamic-key record of data points", () => {
  expectTypeOf<StatsResponse["metrics"]>().toEqualTypeOf<
    Record<string, StatsDataPoint[]> | undefined
  >();
  expectTypeOf<StatsDataPoint[string]>().toEqualTypeOf<string | number>();
  expectTypeOf<StatsResponse["summary"]["total_clicks"]>().toEqualTypeOf<number>();
});

test("StatsExport carries a Blob and an optional filename", () => {
  expectTypeOf<StatsExport["data"]>().toEqualTypeOf<Blob>();
  expectTypeOf<StatsExport["filename"]>().toEqualTypeOf<string | undefined>();
});

test("HealthStatus status is the closed three-state union", () => {
  expectTypeOf<HealthStatus["status"]>().toEqualTypeOf<
    "healthy" | "degraded" | "unhealthy"
  >();
});

test("public preview only reveals destinations conditionally", () => {
  expectTypeOf<PublicPreviewResponse["destination"]>().extract<null>().toEqualTypeOf<null>();
});

test("emoji entries keep the compact wire keys", () => {
  expectTypeOf<EmojiSet["emoji"][number]["c"]>().toEqualTypeOf<string>();
  expectTypeOf<EmojiSet["emoji"][number]["gen"]>().toEqualTypeOf<boolean>();
});
