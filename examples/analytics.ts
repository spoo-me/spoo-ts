// Click analytics: account-wide, per-link, and file exports.
import { writeFile } from "node:fs/promises";
import { Spoo } from "spoo.me";

const spoo = new Spoo();

// Account-wide aggregate, broken down by day and country, mobile India only.
const stats = await spoo.stats.get({
  startDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
  groupBy: ["time", "country"],
  device: ["mobile"],
  country: ["India"],
  timezone: "Asia/Kolkata",
});
console.log(stats.summary.total_clicks, "clicks,", stats.summary.unique_clicks, "unique");
for (const row of stats.metrics?.["clicks_by_time"] ?? []) {
  console.log(row["time"], row["clicks"]);
}

// Slice the aggregate to specific links you own.
await spoo.stats.get({ shortCode: ["launch", "🚀🔥"] });

// Or address one link directly by id.
const one = await spoo.stats.getForLink("665f1e77bcf86cd799439011", {
  groupBy: ["referrer"],
});
console.log(one.alias, one.summary.total_clicks);

// Exports come back as a Blob with the server-suggested filename.
// Note: the "csv" format is a ZIP archive (one CSV per dimension).
const file = await spoo.stats.export({ groupBy: ["country", "browser"] }, "xlsx");
await writeFile(file.filename ?? "stats.xlsx", new Uint8Array(await file.data.arrayBuffer()));
