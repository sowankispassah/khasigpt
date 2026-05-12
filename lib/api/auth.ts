import "server-only";

import type { Session } from "next-auth";
import type { UserRole } from "@/app/(auth)/auth";
import { auth } from "@/app/(auth)/auth";
import { getUserById } from "@/lib/db/queries";
import type { User } from "@/lib/db/schema";
import { verifyMobileAuthToken } from "@/lib/mobile-auth-token";
import { withTimeout } from "@/lib/utils/async";

export type AuthenticatedRouteUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  dateOfBirth?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageVersion?: string | null;
  allowPersonalKnowledge?: boolean;
};

export type AuthenticatedRouteSession = {
  user: AuthenticatedRouteUser;
  expires?: string;
};

export type AuthenticatedRequestContext = {
  source: "bearer" | "cookie";
  session: AuthenticatedRouteSession;
  user: AuthenticatedRouteUser;
};

type AuthOptions = {
  allowBearer?: boolean;
  allowCookie?: boolean;
  bearerTimeoutMs?: number;
  cookieTimeoutMs?: number;
};

const DEFAULT_COOKIE_AUTH_TIMEOUT_MS = 3500;

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const headerToken = request.headers.get("x-mobile-auth-token")?.trim();
  return headerToken && headerToken.length > 0 ? headerToken : null;
}

function createSessionFromUser(user: User): AuthenticatedRouteSession {
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

function createSessionFromAuthSession(
  session: Session
): AuthenticatedRouteSession | null {
  if (!session.user?.id) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? session.user.email ?? null,
      role: session.user.role,
      dateOfBirth: session.user.dateOfBirth ?? null,
      firstName: session.user.firstName ?? null,
      lastName: session.user.lastName ?? null,
      imageVersion: session.user.imageVersion ?? null,
      allowPersonalKnowledge: session.user.allowPersonalKnowledge ?? false,
    },
    expires: session.expires,
  };
}

export async function getAuthenticatedUser(
  request: Request,
  {
    allowBearer = true,
    allowCookie = true,
    bearerTimeoutMs,
    cookieTimeoutMs = DEFAULT_COOKIE_AUTH_TIMEOUT_MS,
  }: AuthOptions = {}
): Promise<AuthenticatedRequestContext | null> {
  if (allowBearer) {
    const token = getBearerToken(request);
    if (token) {
      const loadBearerContext = async () => {
        const verified = verifyMobileAuthToken(token);
        if (verified) {
          const user = await getUserById(verified.userId);
          if (user?.isActive) {
            const session = createSessionFromUser(user);
            return {
              source: "bearer" as const,
              session,
              user: session.user,
            };
          }
        }
        return null;
      };
      const bearerContext =
        typeof bearerTimeoutMs === "number" && bearerTimeoutMs > 0
          ? await withTimeout(loadBearerContext(), bearerTimeoutMs).catch(
              (error) => {
                console.warn(
                  "[api/auth] Bearer auth lookup failed or timed out.",
                  error
                );
                return null;
              }
            )
          : await loadBearerContext();
      if (bearerContext) {
        return bearerContext;
      }
    }
  }

  if (!allowCookie) {
    return null;
  }

  try {
    const cookieSession = await withTimeout(auth(), cookieTimeoutMs);
    const session = cookieSession
      ? createSessionFromAuthSession(cookieSession)
      : null;
    if (!session?.user) {
      return null;
    }

    return {
      source: "cookie",
      session,
      user: session.user,
    };
  } catch (error) {
    console.warn("[api/auth] Cookie auth lookup failed or timed out.", error);
    return null;
  }
}

export async function requireAuthenticatedUser(
  request: Request,
  options?: AuthOptions
) {
  return getAuthenticatedUser(request, options);
}

export async function requireAdminUser(request: Request, options?: AuthOptions) {
  const context = await getAuthenticatedUser(request, options);
  return context?.user.role === "admin" ? context : null;
}

export { createSessionFromUser as createMobileSessionFromUser };
