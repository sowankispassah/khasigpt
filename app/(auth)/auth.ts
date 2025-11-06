import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { DUMMY_PASSWORD } from "@/lib/constants";
import { ensureOAuthUser, getUser, getUserById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  incrementRateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { authConfig } from "./auth.config";

export type UserRole = "regular" | "admin";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      dateOfBirth: string | null;
      imageVersion: string | null;
      firstName: string | null;
      lastName: string | null;
    } & DefaultSession["user"];
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: Required augmentation type
  interface User {
    id?: string;
    email?: string | null;
    role: UserRole;
    dateOfBirth?: string | null;
    image?: string | null;
    imageVersion?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }
}

const ACCOUNT_INACTIVE_ERROR = "AccountInactive";

const providers: any[] = [
  Credentials({
    credentials: {},
    async authorize({ email, password }: any) {
      const emailInput = typeof email === "string" ? email : "";
      const normalizedEmail = emailInput.trim().toLowerCase();
      const rateLimitKey = `login:${normalizedEmail || "unknown"}`;
      const passwordInput = typeof password === "string" ? password : "";

      const { allowed } = incrementRateLimit(rateLimitKey, {
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
      } as typeof rest & { role: UserRole; imageVersion: string | null };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

const ACCOUNT_INACTIVE_REDIRECT = "/login?error=AccountInactive";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    async signIn({ user, account }: { user: any; account?: any }) {
      if (account?.provider === "google") {
        if (!user.email) {
          return false;
        }

        const profileImage =
          typeof user.image === "string" ? user.image : null;
        try {
          const fullName =
            typeof user.name === "string" ? user.name.trim() : "";
          const googleFirstName =
            typeof (user as Record<string, unknown>).given_name === "string"
              ? ((user as Record<string, string>).given_name ?? "").trim()
              : fullName.split(" ")[0] ?? "";
          const googleLastName =
            typeof (user as Record<string, unknown>).family_name === "string"
              ? ((user as Record<string, string>).family_name ?? "").trim()
              : fullName.split(" ").slice(1).join(" ");

          const dbUser = await ensureOAuthUser(user.email, {
            image: profileImage,
            firstName: googleFirstName || null,
            lastName: googleLastName || null,
          });
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
        } catch (error) {
          if (
            error instanceof ChatSDKError &&
            error.cause === "account_inactive"
          ) {
            return ACCOUNT_INACTIVE_REDIRECT;
          }
          throw error;
        }
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
      } else {
        if (!token.role) {
          token.role = "regular";
        }
      }

      if (trigger === "update" && session) {
        if ("imageVersion" in session) {
          token.imageVersion = (session.imageVersion as string | null) ?? null;
        }
        if ("dateOfBirth" in session) {
          token.dateOfBirth = (session.dateOfBirth as string | null) ?? null;
        }
        if ("firstName" in session) {
          token.firstName = (session.firstName as string | null) ?? null;
        }
        if ("lastName" in session) {
          token.lastName = (session.lastName as string | null) ?? null;
        }
      }

      if (
        token.id &&
        (typeof token.dateOfBirth === "undefined" ||
          token.dateOfBirth === null ||
          typeof token.imageVersion === "undefined" ||
          typeof token.firstName === "undefined" ||
          token.firstName === null ||
          typeof token.lastName === "undefined" ||
          token.lastName === null)
      ) {
        const record = await getUserById(token.id as string);
        if (record) {
          if (typeof token.dateOfBirth === "undefined" || token.dateOfBirth === null) {
            token.dateOfBirth = record.dateOfBirth ?? null;
          }
          token.imageVersion =
            record.image && record.updatedAt instanceof Date
              ? record.updatedAt.toISOString()
              : record.image
                ? new Date().toISOString()
                : null;
          if (typeof token.firstName === "undefined" || token.firstName === null) {
            token.firstName = record.firstName ?? null;
          }
          if (typeof token.lastName === "undefined" || token.lastName === null) {
            token.lastName = record.lastName ?? null;
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

      return token;
    },
    session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = (token.id ?? session.user.id) as string;
        session.user.role = (token.role as UserRole | undefined) ?? "regular";
        session.user.dateOfBirth = (token.dateOfBirth ?? null) as string | null;
        session.user.imageVersion = (token.imageVersion ?? null) as string | null;
        session.user.firstName = (token.firstName ?? null) as string | null;
        session.user.lastName = (token.lastName ?? null) as string | null;
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
