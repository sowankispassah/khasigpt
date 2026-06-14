import { NextResponse } from "next/server";
import { AuthLookupUnavailableError } from "@/lib/api/auth";
import { withApiTiming } from "@/lib/api/observability";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let session: Awaited<ReturnType<typeof getMobileSession>>;
  try {
    session = await withApiTiming(
      "mobile.auth.session",
      () =>
        getMobileSession(request, {
          allowCookie: false,
          bearerTimeoutMs: 2500,
        }),
      { slowMs: 500 }
    );
  } catch (error) {
    if (error instanceof AuthLookupUnavailableError) {
      return NextResponse.json(
        {
          code: error.code,
          message: "Session validation is temporarily unavailable.",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: error.status,
        }
      );
    }
    throw error;
  }

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
