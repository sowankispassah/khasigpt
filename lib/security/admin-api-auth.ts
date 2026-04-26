import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@/app/(auth)/auth";
import { withTimeout } from "@/lib/utils/async";

type AdminApiUser = {
  id: string;
  role: UserRole;
};

const ADMIN_AUTH_TIMEOUT_MS = 20_000;

export async function requireAdminApiUser(
  request: NextRequest
): Promise<AdminApiUser | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (secret) {
    const token = await getToken({ req: request, secret }).catch(() => null);
    if (
      token?.role === "admin" &&
      typeof token.id === "string" &&
      token.id.trim().length > 0
    ) {
      return {
        id: token.id,
        role: "admin",
      };
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

  return {
    id: session.user.id,
    role: session.user.role,
  };
}
