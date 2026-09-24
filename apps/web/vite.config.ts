import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const gameEntry = fileURLToPath(new URL("../../packages/game/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@plotgo/game": path.resolve(gameEntry),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
});
