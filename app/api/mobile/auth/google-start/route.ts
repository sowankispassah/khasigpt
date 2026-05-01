import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign in is not configured." },
      { status: 503 }
    );
  }

  const origin = new URL(request.url).origin;
  const url = new URL(`${origin}/api/auth/signin/google`);
  url.searchParams.set(
    "callbackUrl",
    `${origin}/api/mobile/auth/oauth-complete`
  );

  return NextResponse.redirect(url);
}
