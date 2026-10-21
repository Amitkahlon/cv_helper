import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "../dist/ui", emptyOutDir: true },
  // With `npm run dev:ui`, API calls go to the running `cvhelper ui` server.
  server: { proxy: { "/api": "http://127.0.0.1:4321" } },
});
