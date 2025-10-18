import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

import { DUMMY_PASSWORD } from "@/lib/constants";
import { ensureOAuthUser, getUser } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

export type UserRole = "regular" | "admin";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: Required augmentation type
  interface User {
    id?: string;
    email?: string | null;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: UserRole;
  }
}

const providers: Provider[] = [
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
        await compare(password, DUMMY_PASSWORD);
        return null;
      }

      const passwordsMatch = await compare(password, user.password);

      if (!passwordsMatch) {
        return null;
      }

      return { ...user, role: user.role } as typeof user & { role: UserRole };
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

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) {
          return false;
        }

        const dbUser = await ensureOAuthUser(user.email);
        user.id = dbUser.id;
        user.role = dbUser.role as UserRole;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user.role as UserRole) ?? "regular";
      } else if (!token.role) {
        token.role = "regular";
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role ?? "regular";
      }

      return session;
    },
  },
});
