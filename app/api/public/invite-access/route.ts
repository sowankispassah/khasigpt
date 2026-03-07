import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { hasActivePrelaunchInviteAccessForUser } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        {
          authenticated: false,
          hasAccess: false,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    if (session?.user?.role === "admin") {
      return NextResponse.json(
        {
          authenticated: true,
          hasAccess: true,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const hasAccess = await hasActivePrelaunchInviteAccessForUser(userId);
    return NextResponse.json(
      {
        authenticated: true,
        hasAccess,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[api/public/invite-access] Failed to resolve invite access.",
      error
    );
    return NextResponse.json(
      {
        authenticated: false,
        hasAccess: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
