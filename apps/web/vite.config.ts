import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gameEntry = fileURLToPath(new URL("../../packages/game/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@plotgo/game": path.resolve(gameEntry),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        // Standalone Three.js environment prototype (does not touch the game).
        world: fileURLToPath(new URL("world.html", import.meta.url)),
        map: fileURLToPath(new URL("map.html", import.meta.url)),
      },
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
