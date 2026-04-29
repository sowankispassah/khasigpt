import { NextResponse } from "next/server";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  return NextResponse.json(
    { session },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
