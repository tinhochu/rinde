import { connection } from "next/server";
import { authMethods } from "@/server/auth";

// Which sign-in buttons the app should show (Google only once its keys are configured). Read per request:
// the keys live in the running server's environment, not in the build's.
export async function GET() {
  await connection();
  return Response.json({ methods: authMethods });
}
