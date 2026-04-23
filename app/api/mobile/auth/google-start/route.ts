import { signIn } from "@/app/(auth)/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return signIn("google", {
    redirectTo: `${origin}/api/mobile/auth/oauth-complete`,
  });
}
