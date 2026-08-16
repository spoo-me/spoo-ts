import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  target: "node20",
  // "type": "module" makes .js unambiguously ESM; no need for .mjs.
  fixedExtension: false,
});
