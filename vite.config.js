import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Every runtime dependency is pre-bundled so the browser and server load one copy of React.
// Not listed: React itself, the TanStack framework (its plugin bundles it) and build-time plugins.
const NOT_PREBUNDLED = new Set([
  "react", "react-dom", "@tanstack/react-start", "@tanstack/react-router",
  "@tanstack/react-router-ssr-query", "tailwindcss-animate",
]);
const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const PREBUNDLE = Object.keys(dependencies).filter((name) => !NOT_PREBUNDLED.has(name));

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  optimizeDeps: { include: PREBUNDLE },
  environments: {
    ssr: {
      optimizeDeps: { include: PREBUNDLE },
    },
  },
  plugins: [tanstackStart({ srcDirectory: "src" }), nitro(), react()],
});
