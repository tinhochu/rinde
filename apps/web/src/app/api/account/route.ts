import { authMethods } from "@/server/auth";

// Which sign-in buttons the app should show (Google only once its keys are configured).
export function GET() {
  return Response.json({ methods: authMethods });
}
