import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server environment
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    // Integration tests share one dev database (receipt holds, invoice numbers, the latest price per
    // listing); files running side by side read each other's rows. Run them one file at a time.
    fileParallelism: !process.env["INTEGRATION"],
  },
});
