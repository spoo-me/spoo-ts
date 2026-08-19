// Shorten links: anonymously, authenticated, and with the full option set.
// Run with: SPOO_API_KEY=spoo_... npx tsx examples/quickstart.ts
import { Spoo } from "spoo.me";

// Reads SPOO_API_KEY from the environment. Pass { apiKey } explicitly if you
// manage secrets yourself, or construct with no key for anonymous use.
const spoo = new Spoo();

// The simplest call. Anonymous creations also return a one-time claim_token
// you can store and later attach to an account via links.claim().
const link = await spoo.links.create({ long_url: "https://example.com/launch" });
console.log(link.short_url, "->", link.long_url);

// Check an alias before fighting for it.
const { available } = await spoo.links.checkAlias("launch");

// Everything at once: custom alias, password, click budget, expiry,
// per-country destinations and custom link-preview cards.
// domain / geo_rules / meta_tags need a verified account.
if (available) {
  await spoo.links.create({
    long_url: "https://example.com/launch",
    alias: "launch",
    password: "hunter2-not-this",
    max_clicks: 10_000,
    expire_after: new Date("2026-12-31T23:59:59Z"),
    geo_rules: { IN: "https://example.com/launch-in" },
    meta_tags: { title: "The launch", color: "#0F62FE" },
  });
}

// Emoji aliases are first-class.
const rocket = await spoo.links.create({
  long_url: "https://example.com/launch",
  alias: "🚀🔥",
  alias_type: "emoji",
});
console.log(rocket.short_url);
