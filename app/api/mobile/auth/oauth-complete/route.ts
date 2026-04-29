import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const url = new URL("khasigpt://oauth-complete");

  if (!session?.user?.id) {
    url.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(url);
  }

  url.searchParams.set(
    "token",
    createMobileAuthToken(session.user.id, { persistent: true })
  );
  return NextResponse.redirect(url);
}
