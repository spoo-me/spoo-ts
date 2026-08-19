// Scheduled production smoke: create a link, read its stats, delete it.
// Catches prod-vs-SDK drift that offline tests cannot. Runs against the
// built SDK (npm run build first) with a dedicated low-scope API key.
import { Spoo } from "../dist/index.js";

const apiKey = process.env.SPOO_SMOKE_API_KEY;
if (!apiKey) {
  console.error("SPOO_SMOKE_API_KEY is not set");
  process.exit(1);
}

const spoo = new Spoo({ apiKey, clientTag: "sdk-ts-smoke" });
let id;

try {
  const link = await spoo.links.create({
    long_url: `https://example.com/?smoke=${Date.now()}`,
  });
  id = link.id;
  if (!link.short_url.startsWith("http")) throw new Error("create: bad short_url");
  if (!(link.created_at instanceof Date)) throw new Error("create: created_at not a Date");
  console.log("create ok:", link.short_url);

  const stats = await spoo.stats.getForLink(id, { groupBy: ["time"] });
  if (typeof stats.summary.total_clicks !== "number") {
    throw new Error("stats: summary.total_clicks missing");
  }
  console.log("stats ok: total_clicks =", stats.summary.total_clicks);

  const emoji = await spoo.emoji.getSet();
  if (!Array.isArray(emoji.emoji) || emoji.emoji.length === 0) {
    throw new Error("emoji-set: empty catalogue");
  }
  console.log("emoji-set ok:", emoji.emoji.length, "entries");
} finally {
  if (id) {
    await spoo.links.delete(id);
    console.log("cleanup ok: deleted", id);
  }
}
console.log("smoke passed");
