import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Coolify Docker image
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  // Internal workspace packages ship TypeScript source
  transpilePackages: ["@rinde/core", "@rinde/db", "@rinde/retailers"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "mupdf"],
  cacheComponents: true,
  experimental: {
    // The CORS proxy buffers request bodies, 10 MB by default and silently cut beyond that; a long
    // receipt uploads up to 4 photos of up to 10 MB each (apps/web/src/server/receipts.ts).
    proxyClientMaxBodySize: "42mb",
  },
  partialPrefetching: true,
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
