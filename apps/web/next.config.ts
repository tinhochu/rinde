import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Coolify Docker image
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  // Internal workspace packages ship TypeScript source
  transpilePackages: ["@rinde/core", "@rinde/db", "@rinde/retailers"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  cacheComponents: true,
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
