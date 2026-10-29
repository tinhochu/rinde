import { NextResponse, type NextRequest } from "next/server";
import { allowedOrigins } from "@/server/origins";


const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  // The web app's sign-in cookie rides along on API calls.
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, X-Rinde-Session, X-Captcha-Response",
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

// The inbound email webhook is left out: it needs no CORS, and its signature is checked over the raw body.
export const config = {
  matcher: "/api/((?!inbound/).*)",
};
