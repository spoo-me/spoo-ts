// List, filter, update and bulk-edit the links you own.
import { Spoo, asUrlId } from "spoo.me";

const spoo = new Spoo();

// Pages are async-iterable: this walks ALL pages lazily, not just the first.
for await (const link of await spoo.links.list({ sortBy: "total_clicks" })) {
  console.log(link.alias, link.total_clicks, link.created_at?.toISOString());
}

// Or drive pagination by hand.
let page = await spoo.links.list({
  pageSize: 50,
  filter: { status: "ACTIVE", createdAfter: new Date("2026-01-01") },
});
while (true) {
  console.log(`page ${page.page}: ${page.items.length} of ${page.total}`);
  if (!page.hasNextPage()) break;
  page = await page.getNextPage();
}

// Bulk operations return per-item results and never throw on item failures:
// the request can succeed while every item fails, so check the summary.
const staleIds = page.items.filter((l) => l.total_clicks === 0).map((l) => l.id);
if (staleIds.length > 0) {
  const result = await spoo.links.bulk.setStatus(staleIds, "INACTIVE");
  if (result.summary.failed > 0) {
    for (const item of result.results.filter((r) => !r.ok)) {
      console.warn(`${item.id}: ${item.error_code}`);
    }
  }
}

// Claim links that were created anonymously (e.g. from your marketing site)
// using the claim_token each anonymous create returned. Ids the SDK handed
// you are already UrlId; ids persisted as plain strings go through asUrlId.
await spoo.links.claim([
  { urlId: asUrlId("665f1e77bcf86cd799439011"), claimToken: "stored-earlier" },
]);
