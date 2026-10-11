import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/app/(auth)/auth";
import { getAuthUserRoleById } from "@/lib/db/auth-queries";
import { hasCurrentSessionVersion } from "@/lib/security/session-version";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
const SESSION_ROLE_DB_TIMEOUT_MS = 4_000;
export async function GET(request: Request) {
  try {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    const token = secret
      ? await getToken({ req: request, secret }).catch(() => null)
      : null;
    const session =
      typeof token?.id === "string"
        ? null
        : await withTimeout(auth(), SESSION_ROLE_DB_TIMEOUT_MS).catch(() => null);
    const userId =
      typeof token?.id === "string"
        ? token.id
        : typeof session?.user?.id === "string"
          ? session.user.id
          : null;
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
      getAuthUserRoleById(userId),
      SESSION_ROLE_DB_TIMEOUT_MS
    );
    const isActiveUser = Boolean(user?.isActive && hasCurrentSessionVersion(typeof token?.id === "string" ? token.sessionVersion : session?.user?.sessionVersion, user.sessionVersion));
    const role = isActiveUser && user?.role ? user.role : null;

    return NextResponse.json(
      {
        authenticated: isActiveUser,
        role,
        source: "database",
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
        degraded: true,
        role: null,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
