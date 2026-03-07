import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";

import {
  DUMMY_PASSWORD,
  PRELAUNCH_INVITE_COOKIE_NAME,
} from "@/lib/constants";
import {
  consumeImpersonationToken,
  createAuditLogEntry,
  createGuestUser,
  ensureOAuthUser,
  getUser,
  getUserById,
  redeemPrelaunchInviteTokenForUser,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { withTimeout } from "@/lib/utils/async";
import { authConfig } from "./auth.config";

export type UserRole = "regular" | "creator" | "admin";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      dateOfBirth: string | null;
      imageVersion: string | null;
      firstName: string | null;
      lastName: string | null;
      allowPersonalKnowledge: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    role: UserRole;
    dateOfBirth?: string | null;
    image?: string | null;
    imageVersion?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    allowPersonalKnowledge?: boolean;
  }
}

const ACCOUNT_INACTIVE_ERROR = "AccountInactive";
const AUTH_DB_TIMEOUT_MS = 4000;
const AUTH_DB_REFRESH_MS = 5 * 60 * 1000;
const AUTH_DB_FAILURE_COOLDOWN_MS = 30 * 1000;
const INVITE_REDEMPTION_TIMEOUT_MS = 2500;

const providers: any[] = [
  Credentials({
    credentials: {},
    async authorize({ email, password }: any) {
      const emailInput = typeof email === "string" ? email : "";
      const normalizedEmail = emailInput.trim().toLowerCase();
      const rateLimitKey = `login:${normalizedEmail || "unknown"}`;
      const passwordInput = typeof password === "string" ? password : "";

      const { allowed } = await incrementRateLimit(rateLimitKey, {
        limit: 5,
        windowMs: 10 * 60 * 1000,
      });

      if (!allowed) {
        await compare(passwordInput, DUMMY_PASSWORD);
        throw new ChatSDKError(
          "rate_limit:auth",
          "Too many login attempts. Please try again later."
        );
      }

      const users = await getUser(email);

      if (users.length === 0) {
        await compare(passwordInput, DUMMY_PASSWORD);
        return null;
      }

      const [user] = users;

      if (!user.password) {
        await compare(passwordInput, DUMMY_PASSWORD);
        return null;
      }

      if (!user.isActive) {
        await compare(passwordInput, user.password ?? DUMMY_PASSWORD);
        throw new Error(ACCOUNT_INACTIVE_ERROR);
      }

      const passwordsMatch = await compare(passwordInput, user.password);

      if (!passwordsMatch) {
        return null;
      }

      resetRateLimit(rateLimitKey);

      const { image, ...rest } = user;
      const imageVersion =
        image && user.updatedAt instanceof Date
          ? user.updatedAt.toISOString()
          : image
            ? new Date().toISOString()
            : null;

      return {
        ...rest,
        role: user.role,
        imageVersion,
        allowPersonalKnowledge: user.allowPersonalKnowledge ?? false,
      } as typeof rest & { role: UserRole; imageVersion: string | null };
    },
  }),
];

providers.push(
  Credentials({
    id: "guest",
    name: "Guest",
    credentials: {},
    async authorize() {
      const [record] = await createGuestUser();

      return {
        ...record,
        role: (record as any).role ?? "regular",
        name: "Guest",
        imageVersion: null,
        allowPersonalKnowledge: false,
        firstName: null,
        lastName: null,
      } as typeof record & {
        role: UserRole;
        imageVersion: string | null;
        allowPersonalKnowledge: boolean;
        firstName: string | null;
        lastName: string | null;
      };
    },
  })
);

providers.push(
  Credentials({
    id: "impersonate",
    name: "Impersonate",
    credentials: {},
    async authorize({ token }: any) {
      const tokenValue = typeof token === "string" ? token : "";
      if (!tokenValue) {
        return null;
      }

      const record = await consumeImpersonationToken(tokenValue);
      if (!record) {
        return null;
      }

      const targetUser = await getUserById(record.targetUserId);
      if (!targetUser) {
        return null;
      }

      const { image, ...rest } = targetUser;
      const imageVersion =
        image && targetUser.updatedAt instanceof Date
          ? targetUser.updatedAt.toISOString()
          : image
            ? new Date().toISOString()
            : null;

      return {
        ...rest,
        role: targetUser.role as UserRole,
        imageVersion,
        allowPersonalKnowledge: targetUser.allowPersonalKnowledge ?? false,
      } as typeof rest & { role: UserRole; imageVersion: string | null };
    },
  })
);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

const ACCOUNT_INACTIVE_REDIRECT = "/login?error=AccountInactive";
const ACCOUNT_LINK_REQUIRED_REDIRECT = "/login?error=AccountLinkRequired";

async function applyPendingInviteAccess(userId: string) {
  try {
    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PRELAUNCH_INVITE_COOKIE_NAME)?.value;
    const token = typeof pendingToken === "string" ? pendingToken.trim() : "";

    if (!token) {
      return;
    }

    await withTimeout(
      redeemPrelaunchInviteTokenForUser({
        token,
        userId,
      }),
      INVITE_REDEMPTION_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        "[auth] Failed to redeem pending prelaunch invite token during sign-in.",
        error
      );
      return null;
    });

    cookieStore.set(PRELAUNCH_INVITE_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch (error) {
    console.error("[auth] Failed to resolve pending invite cookie.", error);
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
  unstable_update,
} = NextAuth({
  ...authConfig,
  providers,
  events: {
    async signIn({ user, account, isNewUser }) {
      const actorId = typeof user?.id === "string" ? user.id : null;
      if (!actorId) {
        return;
      }

      const clientInfo = await getClientInfoFromHeaders();
      const userWithFlag = user as { isNewUser?: boolean } | null | undefined;
      const inferredIsNewUser =
        typeof isNewUser === "boolean"
          ? isNewUser
          : typeof userWithFlag?.isNewUser === "boolean"
            ? userWithFlag.isNewUser
            : false;

      try {
        await createAuditLogEntry({
          actorId,
          action: inferredIsNewUser ? "user.signup" : "user.login",
          target: {
            userId: actorId,
            email: typeof user?.email === "string" ? user.email : undefined,
          },
          metadata: {
            provider: account?.provider,
            type: account?.type,
            isNewUser: inferredIsNewUser,
          },
          subjectUserId: actorId,
          ...clientInfo,
        });
      } catch (error) {
        console.error("Failed to record auth audit log", error);
      }
    },
  },
  callbacks: {
    async signIn({ user, account }: { user: any; account?: any }) {
      if (account?.provider === "google") {
        if (!user.email) {
          return false;
        }

        const profileImage = typeof user.image === "string" ? user.image : null;
        try {
          const fullName =
            typeof user.name === "string" ? user.name.trim() : "";
          const googleFirstName =
            typeof (user as Record<string, unknown>).given_name === "string"
              ? ((user as Record<string, string>).given_name ?? "").trim()
              : (fullName.split(" ")[0] ?? "");
          const googleLastName =
            typeof (user as Record<string, unknown>).family_name === "string"
              ? ((user as Record<string, string>).family_name ?? "").trim()
              : fullName.split(" ").slice(1).join(" ");

          const { user: dbUser, isNewUser: isNewOAuthUser } =
            await ensureOAuthUser(user.email, {
              image: profileImage,
              firstName: googleFirstName || null,
              lastName: googleLastName || null,
            });
          (user as Record<string, unknown>).isNewUser = isNewOAuthUser;
          user.id = dbUser.id;
          user.role = dbUser.role as UserRole;
          user.image = null;
          user.imageVersion =
            dbUser.image && dbUser.updatedAt instanceof Date
              ? dbUser.updatedAt.toISOString()
              : dbUser.image
                ? new Date().toISOString()
                : null;
          user.dateOfBirth = dbUser.dateOfBirth ?? user.dateOfBirth ?? null;
          user.firstName = dbUser.firstName ?? user.firstName ?? null;
          user.lastName = dbUser.lastName ?? user.lastName ?? null;
          if (!user.name && (dbUser.firstName || dbUser.lastName)) {
            user.name = [dbUser.firstName, dbUser.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();
          }
          user.allowPersonalKnowledge = dbUser.allowPersonalKnowledge ?? false;
        } catch (error) {
          if (error instanceof ChatSDKError) {
            if (error.cause === "account_inactive") {
              return ACCOUNT_INACTIVE_REDIRECT;
            }
            if (error.cause === "account_link_required") {
              return ACCOUNT_LINK_REQUIRED_REDIRECT;
            }
          }
          throw error;
        }
      }

      if (typeof user?.id === "string" && user.role !== "admin") {
        await applyPendingInviteAccess(user.id);
      }

      return true;
    },
    jwt: async ({
      token,
      user,
      trigger,
      session,
    }: {
      token: any;
      user?: any;
      trigger?: "signIn" | "signUp" | "update" | undefined;
      session?: Record<string, unknown>;
    }) => {
      if (user) {
        token.id = user.id as string;
        token.role = (user.role as UserRole) ?? "regular";
        token.dateOfBirth = user.dateOfBirth ?? null;
        token.imageVersion = user.imageVersion ?? null;
        token.firstName = user.firstName ?? null;
        token.lastName = user.lastName ?? null;
        token.allowPersonalKnowledge = user.allowPersonalKnowledge ?? false;
      } else if (!token.role) {
        token.role = "regular";
      }

      let cachedDbUser:
        | Awaited<ReturnType<typeof getUserById>>
        | null
        | undefined;
      let dbLookupTimedOut = false;
      let dbLookupFailed = false;
      const isMissingField = (value: unknown) =>
        value === null ||
        typeof value === "undefined" ||
        (typeof value === "string" && value.trim().length === 0);
      const needsDbFields =
        Boolean(token.id) &&
        (isMissingField(token.dateOfBirth) ||
          typeof token.imageVersion === "undefined" ||
          isMissingField(token.firstName) ||
          isMissingField(token.lastName));
      const lastDbRefresh =
        typeof token.dbRefreshedAt === "number" ? token.dbRefreshedAt : 0;
      const lastDbFailure =
        typeof token.dbRefreshFailedAt === "number"
          ? token.dbRefreshFailedAt
          : 0;
      const isFailureCooldownActive =
        lastDbFailure > 0 &&
        Date.now() - lastDbFailure < AUTH_DB_FAILURE_COOLDOWN_MS;
      const shouldRefreshDb =
        needsDbFields ||
        trigger === "update" ||
        !lastDbRefresh ||
        Date.now() - lastDbRefresh > AUTH_DB_REFRESH_MS;
      const ensureDbUser = async () => {
        if (!token.id) {
          cachedDbUser = null;
          return null;
        }
        if (!shouldRefreshDb || isFailureCooldownActive) {
          return cachedDbUser;
        }
        if (dbLookupTimedOut) {
          return undefined;
        }
        if (typeof cachedDbUser !== "undefined") {
          return cachedDbUser;
        }
        try {
          cachedDbUser = await withTimeout(
            getUserById(token.id as string),
            AUTH_DB_TIMEOUT_MS,
            () => {
              console.warn(
                `[auth] getUserById timed out after ${AUTH_DB_TIMEOUT_MS}ms.`
              );
            }
          );
          dbLookupFailed = false;
        } catch (error) {
          if (error instanceof Error && error.message === "timeout") {
            dbLookupTimedOut = true;
            cachedDbUser = undefined;
            token.dbRefreshFailedAt = Date.now();
            return cachedDbUser;
          }
          console.error("[auth] Failed to load user for session refresh", error);
          dbLookupFailed = true;
          cachedDbUser = undefined;
          token.dbRefreshFailedAt = Date.now();
        }
        return cachedDbUser;
      };

      if (trigger === "update" && session) {
        const sessionRecord = session as Record<string, unknown>;
        const sessionUser =
          sessionRecord.user && typeof sessionRecord.user === "object"
            ? (sessionRecord.user as Record<string, unknown>)
            : null;
        const readSessionValue = (key: string) => {
          if (key in sessionRecord) {
            return sessionRecord[key];
          }
          if (sessionUser && key in sessionUser) {
            return sessionUser[key];
          }
          return undefined;
        };
        const imageVersion = readSessionValue("imageVersion");
        if (typeof imageVersion !== "undefined") {
          token.imageVersion = (imageVersion as string | null) ?? null;
        }
        const dateOfBirth = readSessionValue("dateOfBirth");
        if (typeof dateOfBirth !== "undefined") {
          token.dateOfBirth = (dateOfBirth as string | null) ?? null;
        }
        const firstName = readSessionValue("firstName");
        if (typeof firstName !== "undefined") {
          token.firstName = (firstName as string | null) ?? null;
        }
        const lastName = readSessionValue("lastName");
        if (typeof lastName !== "undefined") {
          token.lastName = (lastName as string | null) ?? null;
        }
        const allowPersonalKnowledge = readSessionValue("allowPersonalKnowledge");
        if (typeof allowPersonalKnowledge !== "undefined") {
          token.allowPersonalKnowledge = Boolean(allowPersonalKnowledge);
        }
      }

      if (needsDbFields) {
        const record = await ensureDbUser();
        if (record) {
          if (isMissingField(token.dateOfBirth)) {
            token.dateOfBirth = record.dateOfBirth ?? null;
          }
          token.imageVersion =
            record.image && record.updatedAt instanceof Date
              ? record.updatedAt.toISOString()
              : record.image
                ? new Date().toISOString()
                : null;
          if (isMissingField(token.firstName)) {
            token.firstName = record.firstName ?? null;
          }
          if (isMissingField(token.lastName)) {
            token.lastName = record.lastName ?? null;
          }
          if (typeof token.allowPersonalKnowledge === "undefined") {
            token.allowPersonalKnowledge =
              record.allowPersonalKnowledge ?? false;
          }
        }
      } else if (typeof token.imageVersion === "undefined") {
        token.imageVersion = null;
      }

      if (typeof token.firstName === "undefined") {
        token.firstName = null;
      }
      if (typeof token.lastName === "undefined") {
        token.lastName = null;
      }
      if (typeof token.allowPersonalKnowledge === "undefined") {
        const record = await ensureDbUser();
        token.allowPersonalKnowledge = record?.allowPersonalKnowledge ?? false;
      }

      if (token.id && (trigger === "update" || shouldRefreshDb)) {
        const record = await ensureDbUser();
        if (record) {
          if (record.role) {
            token.role = record.role as UserRole;
          }
          token.allowPersonalKnowledge = record.allowPersonalKnowledge ?? false;
          token.dbRefreshedAt = Date.now();
          token.dbRefreshFailedAt = undefined;
        } else if (record === null && !dbLookupTimedOut && !dbLookupFailed) {
          // Clear token data if the user no longer exists so downstream calls treat the session as signed out.
          token = {} as typeof token;
        }
      }

      if (!token.role) {
        token.role = "regular";
      }

      return token;
    },
    session({ session, token }: { session: any; token: any }) {
      if (!token.id) {
        return null;
      }
      if (session.user) {
        session.user.id = (token.id ?? session.user.id) as string;
        session.user.role = (token.role as UserRole | undefined) ?? "regular";
        session.user.dateOfBirth = (token.dateOfBirth ?? null) as string | null;
        session.user.imageVersion = (token.imageVersion ?? null) as
          | string
          | null;
        session.user.firstName = (token.firstName ?? null) as string | null;
        session.user.lastName = (token.lastName ?? null) as string | null;
        session.user.allowPersonalKnowledge = Boolean(
          token.allowPersonalKnowledge ?? false
        );
        const computedName = [session.user.firstName, session.user.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (computedName.length > 0) {
          session.user.name = computedName;
        }
      }

      return session;
    },
  },
});
