import { NextResponse, type NextRequest } from "next/server";
import { allowedOrigins } from "@/server/origins";


const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  // The web app's sign-in cookie rides along on API calls.
  "Access-Control-Allow-Credentials": "true",
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
