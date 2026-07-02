import "server-only";

import type { Session } from "next-auth";
import type { UserRole } from "@/app/(auth)/auth";
import { auth } from "@/app/(auth)/auth";
import {
  type AuthDbUser,
  getAuthUserById,
} from "@/lib/db/auth-queries";
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
  adminLookupTimeoutMs?: number;
};

const DEFAULT_BEARER_AUTH_TIMEOUT_MS = 2500;
const DEFAULT_COOKIE_AUTH_TIMEOUT_MS = 4000;
const DEFAULT_ADMIN_AUTH_LOOKUP_TIMEOUT_MS = 2500;

export class AuthLookupUnavailableError extends Error {
  code = "auth_lookup_unavailable";
  status = 503;

  constructor(message = "Authentication lookup is temporarily unavailable.") {
    super(message);
    this.name = "AuthLookupUnavailableError";
  }
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const headerToken = request.headers.get("x-mobile-auth-token")?.trim();
  return headerToken && headerToken.length > 0 ? headerToken : null;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "timeout";
}

function resolveTimeout(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function createSessionFromUser(user: AuthDbUser): AuthenticatedRouteSession {
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
    cookieTimeoutMs,
  }: AuthOptions = {}
): Promise<AuthenticatedRequestContext | null> {
  if (allowBearer) {
    const token = getBearerToken(request);
    if (token) {
      const loadBearerContext = async () => {
        const verified = verifyMobileAuthToken(token);
        if (verified) {
          const user = await getAuthUserById(verified.userId);
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
      const resolvedBearerTimeoutMs = resolveTimeout(
        bearerTimeoutMs,
        DEFAULT_BEARER_AUTH_TIMEOUT_MS
      );
      const bearerContext = await withTimeout(
        loadBearerContext(),
        resolvedBearerTimeoutMs,
        () => {
          console.warn(
            `[api/auth] Bearer auth lookup timed out after ${resolvedBearerTimeoutMs}ms.`
          );
        }
      ).catch((error) => {
        console.warn("[api/auth] Bearer auth lookup failed.", error);
        throw new AuthLookupUnavailableError(
          isTimeoutError(error)
            ? "Bearer authentication lookup timed out."
            : undefined
        );
      });
      if (bearerContext) {
        return bearerContext;
      }
    }
  }

  if (!allowCookie) {
    return null;
  }

  try {
    const resolvedCookieTimeoutMs = resolveTimeout(
      cookieTimeoutMs,
      DEFAULT_COOKIE_AUTH_TIMEOUT_MS
    );
    const cookieSession = await withTimeout(
      auth(),
      resolvedCookieTimeoutMs,
      () => {
        console.warn(
          `[api/auth] Cookie auth lookup timed out after ${resolvedCookieTimeoutMs}ms.`
        );
      }
    );
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
    console.warn("[api/auth] Cookie auth lookup failed.", error);
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
  if (context?.user.role !== "admin") {
    return null;
  }

  const resolvedAdminTimeoutMs = resolveTimeout(
    options?.adminLookupTimeoutMs,
    DEFAULT_ADMIN_AUTH_LOOKUP_TIMEOUT_MS
  );
  const user = await withTimeout(
    getAuthUserById(context.user.id),
    resolvedAdminTimeoutMs,
    () => {
      console.warn(
        `[api/auth] Admin role lookup timed out after ${resolvedAdminTimeoutMs}ms.`
      );
    }
  ).catch((error) => {
    console.warn("[api/auth] Admin role lookup failed.", error);
    return null;
  });
  if (!user?.isActive || user.role !== "admin") {
    return null;
  }

  const session = createSessionFromUser(user);
  return {
    ...context,
    session,
    user: session.user,
  };
}

export { createSessionFromUser as createMobileSessionFromUser };
