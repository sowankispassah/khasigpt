import "server-only";

import { auth } from "@/app/(auth)/auth";
import type { UserRole } from "@/app/(auth)/auth";
import type { User } from "@/lib/db/schema";
import { getUserById } from "@/lib/db/queries";
import { verifyMobileAuthToken } from "@/lib/mobile-auth-token";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
    return token.trim();
  }
  const headerToken = request.headers.get("x-mobile-auth-token")?.trim();
  return headerToken && headerToken.length > 0 ? headerToken : null;
}

export async function getMobileSession(request: Request) {
  try {
    const cookieSession = await auth();
    if (cookieSession?.user?.id) {
      return cookieSession;
    }
  } catch (error) {
    console.warn(
      "[mobile-auth-session] Cookie session lookup failed; falling back to bearer token.",
      error
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const verified = verifyMobileAuthToken(token);
  if (!verified) {
    return null;
  }

  const user = await getUserById(verified.userId);
  if (!user || !user.isActive) {
    return null;
  }

  return createMobileSessionFromUser(user);
}

export function createMobileSessionFromUser(user: User) {
  const computedName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    user: {
      id: user.id,
      email: user.email,
      name: computedName || user.email,
      role: user.role as UserRole,
      dateOfBirth: user.dateOfBirth ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      imageVersion:
        user.image && user.updatedAt instanceof Date
          ? user.updatedAt.toISOString()
          : user.image
            ? new Date().toISOString()
            : null,
      allowPersonalKnowledge: user.allowPersonalKnowledge ?? false,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
