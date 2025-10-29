import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { DUMMY_PASSWORD } from "@/lib/constants";
import { ensureOAuthUser, getUser, getUserById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { authConfig } from "./auth.config";

export type UserRole = "regular" | "admin";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      dateOfBirth: string | null;
      imageVersion: string | null;
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
  }
}

const ACCOUNT_INACTIVE_ERROR = "AccountInactive";

const providers: any[] = [
  Credentials({
    credentials: {},
    async authorize({ email, password }: any) {
      const users = await getUser(email);

      if (users.length === 0) {
        await compare(password, DUMMY_PASSWORD);
        return null;
      }

      const [user] = users;

      if (!user.password) {
        await compare(password, DUMMY_PASSWORD);
        return null;
      }

      if (!user.isActive) {
        await compare(password, user.password ?? DUMMY_PASSWORD);
        throw new Error(ACCOUNT_INACTIVE_ERROR);
      }

      const passwordsMatch = await compare(password, user.password);

      if (!passwordsMatch) {
        return null;
      }

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
      allowDangerousEmailAccountLinking: true,
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
          const dbUser = await ensureOAuthUser(user.email, {
            image: profileImage,
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
      }

      if (
        token.id &&
        (typeof token.dateOfBirth === "undefined" ||
          token.dateOfBirth === null ||
          typeof token.imageVersion === "undefined")
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
        }
      } else if (typeof token.imageVersion === "undefined") {
        token.imageVersion = null;
      }

      return token;
    },
    session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = (token.id ?? session.user.id) as string;
        session.user.role = (token.role as UserRole | undefined) ?? "regular";
        session.user.dateOfBirth = (token.dateOfBirth ?? null) as string | null;
        session.user.imageVersion = (token.imageVersion ?? null) as string | null;
      }

      return session;
    },
  },
});
