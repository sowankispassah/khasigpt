import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  return NextResponse.json(
    {
      token: createMobileAuthToken(session.user.id, { persistent: true }),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
