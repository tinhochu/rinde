import { NextResponse, type NextRequest } from "next/server";

// The Expo client (web PWA + native) calls this API cross-origin.
// CORS_ORIGINS: comma-separated allowlist; defaults cover local Expo dev servers.
const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "http://localhost:8081,http://localhost:19006")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Rinde-Session",
  "Access-Control-Max-Age": "86400",
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin: Record<string, string> = allowedOrigins.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { ...allowOrigin, ...corsHeaders } });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries({ ...allowOrigin, ...corsHeaders })) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
