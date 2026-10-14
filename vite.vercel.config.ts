import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);

// The Sites/Cloudflare configuration stays in vite.config.ts.
export default defineConfig({
  define: { "process.env.INEXT_VERCEL_RUNTIME": JSON.stringify("1") },
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: {
      tailwindcss: require.resolve("tailwindcss/index.css"),
      "cloudflare:workers": fileURLToPath(new URL("./lib/vercel-workers.mjs", import.meta.url)),
    },
  },
  plugins: [vinext(), nitro({ preset: "vercel" })],
});
