import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Hashed files go under /static/: the root domain redirects the old app's /assets/ paths to the app.
export default defineConfig({
  plugins: [react()],
  // The photos are only referenced from the prerendered HTML, so the SSR build emits them (prerender.mjs copies them).
  build: { assetsDir: "static", ssrEmitAssets: true },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
