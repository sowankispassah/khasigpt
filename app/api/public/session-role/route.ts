import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/app/(auth)/auth";
import { getUserById } from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
const SESSION_ROLE_DB_TIMEOUT_MS = 4_000;

export async function GET(request: Request) {
  try {
    let userId: string | null = null;
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (secret) {
      const token = await getToken({ req: request, secret }).catch(() => null);
      if (typeof token?.id === "string") {
        userId = token.id;
      }
    }

    if (!userId) {
      const session = await auth();
      userId = session?.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        {
          authenticated: false,
          role: null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const user = await withTimeout(
      getUserById(userId),
      SESSION_ROLE_DB_TIMEOUT_MS
    ).catch((error) => {
      console.error("[api/public/session-role] Failed to load user role.", error);
      return null;
    });
    const isActiveUser = Boolean(user?.isActive);
    const role = isActiveUser && user?.role ? user.role : null;

    return NextResponse.json(
      {
        authenticated: isActiveUser,
        role,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[api/public/session-role] Failed to resolve session role.",
      error
    );
    return NextResponse.json(
      {
        authenticated: false,
        role: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
