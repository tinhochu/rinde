// The Expo client (web PWA + native) calls this API cross-origin.
// CORS_ORIGINS: comma-separated allowlist; defaults cover local Expo dev servers.
export const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "http://localhost:8081,http://localhost:19006")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
