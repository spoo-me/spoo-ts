import { expectTypeOf, test } from "vitest";
import { asTagId, asUrlId } from "../src/index.js";
import type {
  AggregateStatsParams,
  CreateLinkParams,
  CreateTagParams,
  EmojiSet,
  Link,
  Links,
  CreatedLink,
  LinkStatsResponse,
  ListLinksParams,
  PublicPreviewResponse,
  StatsDataPoint,
  StatsExport,
  StatsParams,
  StatsResponse,
  BulkTagChanges,
  Tag,
  TagColor,
  TagId,
  TagIcon,
  TagRef,
  Tags,
  UpdateLinkParams,
  UpdateTagParams,
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

test("tag ids are branded: a name or a link id does not typecheck as TagId", () => {
  expectTypeOf<Tag["id"]>().toEqualTypeOf<TagId>();
  expectTypeOf<TagRef["id"]>().toEqualTypeOf<TagId>();
  expectTypeOf<TagId>().toMatchTypeOf<string>();
  expectTypeOf<string>().not.toMatchTypeOf<TagId>();
  expectTypeOf<UrlId>().not.toMatchTypeOf<TagId>();
  expectTypeOf<Parameters<Tags["update"]>[0]>().toEqualTypeOf<TagId>();
  expectTypeOf<Parameters<Tags["delete"]>[0]>().toEqualTypeOf<TagId>();
  expectTypeOf(asTagId("665f0c2f9e7a4b1d2c3d4e5f")).toEqualTypeOf<TagId>();
});


test("tags ride on links and their inputs with the generated shapes", () => {
  expectTypeOf<Link["tags"]>().toEqualTypeOf<TagRef[] | undefined>();
  expectTypeOf<CreatedLink["tags"]>().toEqualTypeOf<TagRef[] | undefined>();
  expectTypeOf<CreateLinkParams["tag_ids"]>().toEqualTypeOf<TagId[] | null | undefined>();
  expectTypeOf<UpdateLinkParams["tag_ids"]>().toEqualTypeOf<TagId[] | null | undefined>();
  expectTypeOf<NonNullable<ListLinksParams["filter"]>["tagsMatch"]>().toEqualTypeOf<
    "any" | "all" | undefined
  >();
  expectTypeOf<TagRef["color"]>().toEqualTypeOf<TagColor>();
  expectTypeOf<TagRef["icon"]>().toEqualTypeOf<TagIcon>();
  expectTypeOf<Tag["created_at"]>().toEqualTypeOf<Date>();
  expectTypeOf<Tag["updated_at"]>().toEqualTypeOf<Date | null | undefined>();
  // The API defaults the icon, so callers may leave it out.
  expectTypeOf<CreateTagParams["icon"]>().toEqualTypeOf<TagIcon | undefined>();
  // PATCH rejects icon: null with a 422, and null on name or color is a no-op.
  expectTypeOf<UpdateTagParams["icon"]>().toEqualTypeOf<TagIcon | undefined>();
  expectTypeOf<UpdateTagParams["name"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<UpdateTagParams["color"]>().toEqualTypeOf<TagColor | undefined>();
  // The server 422s on an empty change set, so the type refuses one too.
  expectTypeOf<{}>().not.toMatchTypeOf<BulkTagChanges>();
  expectTypeOf<{ add: TagId[] }>().toMatchTypeOf<BulkTagChanges>();
  expectTypeOf<{ remove: TagId[] }>().toMatchTypeOf<BulkTagChanges>();
  // Tag slices are aggregate-only: the per-link stats endpoints reject them.
  expectTypeOf<AggregateStatsParams["tag"]>().toEqualTypeOf<string[] | undefined>();
  expectTypeOf<StatsParams>().not.toHaveProperty("tag");
});

test("public preview only reveals destinations conditionally", () => {
  expectTypeOf<PublicPreviewResponse["destination"]>().extract<null>().toEqualTypeOf<null>();
});

test("emoji entries keep the compact wire keys", () => {
  expectTypeOf<EmojiSet["emoji"][number]["c"]>().toEqualTypeOf<string>();
  expectTypeOf<EmojiSet["emoji"][number]["gen"]>().toEqualTypeOf<boolean>();
});
