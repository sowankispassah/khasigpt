import type { NextAuthConfig } from "next-auth";

const trustHost =
  process.env.AUTH_TRUST_HOST === "true" ||
  process.env.NODE_ENV !== "production";

export const authConfig = {
  trustHost,
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/",
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {},
} satisfies NextAuthConfig;
