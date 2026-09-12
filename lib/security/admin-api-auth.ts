import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@/app/(auth)/auth";
import { getAuthUserRoleById } from "@/lib/db/auth-queries";
import { withTimeout } from "@/lib/utils/async";

type AdminApiUser = {
  id: string;
  role: UserRole;
};

const ADMIN_AUTH_TIMEOUT_MS = 20_000;
const ADMIN_DB_TIMEOUT_MS = 4_000;

async function resolveActiveAdminUser(userId: string): Promise<AdminApiUser | null> {
  const user = await withTimeout(
    getAuthUserRoleById(userId),
    ADMIN_DB_TIMEOUT_MS
  ).catch((error) => {
    console.error("[admin-api-auth] Admin user lookup failed.", error);
    return null;
  });

  if (!user?.isActive || user.role !== "admin") {
    return null;
  }

  return {
    id: user.id,
    role: "admin",
  };
}

export async function requireAdminApiUser(
  request: NextRequest
): Promise<AdminApiUser | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (secret) {
    const token = await getToken({ req: request, secret }).catch(() => null);
    if (typeof token?.id === "string" && token.id.trim().length > 0) {
      return resolveActiveAdminUser(token.id);
    }
  }

  const { auth } = await import("@/app/(auth)/auth");
  const session = await withTimeout(auth(), ADMIN_AUTH_TIMEOUT_MS).catch(
    (error) => {
      console.error("[admin-api-auth] Admin session fallback failed.", error);
      return null;
    }
  );
  if (!session?.user || session.user.role !== "admin") {
    return null;
  }

  return resolveActiveAdminUser(session.user.id);
}
