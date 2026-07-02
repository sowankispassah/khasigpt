import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/app/(auth)/auth";
import { getUserRoleById } from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
const SESSION_ROLE_DB_TIMEOUT_MS = 4_000;
const USER_ROLES = new Set<UserRole>(["admin", "creator", "regular"]);

function normalizeTokenRole(value: unknown) {
  return typeof value === "string" && USER_ROLES.has(value as UserRole)
    ? (value as UserRole)
    : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requireFreshRole =
      url.searchParams.get("fresh") === "1" ||
      url.searchParams.get("verify") === "admin";
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
    const tokenRole = normalizeTokenRole(token?.role ?? session?.user?.role);
    const roleRefreshedAt = (token as { roleRefreshedAt?: unknown } | null)
      ?.roleRefreshedAt;
    const tokenRoleConfirmed =
      tokenRole === "admin" ||
      (!requireFreshRole &&
        tokenRole !== null &&
        typeof roleRefreshedAt === "number");

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

    if (tokenRoleConfirmed) {
      return NextResponse.json(
        {
          authenticated: true,
          role: tokenRole,
          source: "token",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const user = await withTimeout(
      getUserRoleById(userId),
      SESSION_ROLE_DB_TIMEOUT_MS
    );
    const isActiveUser = Boolean(user?.isActive);
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
