import { expectTypeOf, test } from "vitest";
import { asUrlId } from "../src/index.js";
import type {
  EmojiSet,
  Link,
  Links,
  CreatedLink,
  LinkStatsResponse,
  PublicPreviewResponse,
  StatsDataPoint,
  StatsExport,
  StatsResponse,
  UrlId,
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

test("StatsExport carries a Blob and a guaranteed filename", () => {
  expectTypeOf<StatsExport["data"]>().toEqualTypeOf<Blob>();
  expectTypeOf<StatsExport["filename"]>().toEqualTypeOf<string>();
});

test("link ids are branded: a plain string does not typecheck as UrlId", () => {
  // Everywhere the API returns an ObjectId, the brand is already applied.
  expectTypeOf<Link["id"]>().toEqualTypeOf<UrlId>();
  expectTypeOf<CreatedLink["id"]>().toEqualTypeOf<UrlId>();
  expectTypeOf<LinkStatsResponse["url_id"]>().toEqualTypeOf<UrlId>();

  // A UrlId is still a string to consumers; the reverse does not hold, so
  // an alias or short code cannot be passed where an id is expected.
  expectTypeOf<UrlId>().toMatchTypeOf<string>();
  expectTypeOf<string>().not.toMatchTypeOf<UrlId>();
  expectTypeOf<Parameters<Links["get"]>[0]>().toEqualTypeOf<UrlId>();

  // Persisted plain-string ids enter through the cast helper.
  expectTypeOf(asUrlId("665f0c2f9e7a4b1d2c3d4e5f")).toEqualTypeOf<UrlId>();
});


test("public preview only reveals destinations conditionally", () => {
  expectTypeOf<PublicPreviewResponse["destination"]>().extract<null>().toEqualTypeOf<null>();
});

test("emoji entries keep the compact wire keys", () => {
  expectTypeOf<EmojiSet["emoji"][number]["c"]>().toEqualTypeOf<string>();
  expectTypeOf<EmojiSet["emoji"][number]["gen"]>().toEqualTypeOf<boolean>();
});
