import type { NextAuthConfig } from "next-auth";

// Default to trusting the host in production to avoid callback/CSRF issues unless explicitly disabled.
const trustHost = process.env.AUTH_TRUST_HOST !== "false";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

export const authConfig = {
  trustHost,
  secret: authSecret,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  cookies: cookieDomain
    ? {
        sessionToken: {
          options: {
            domain: cookieDomain,
          },
        },
      }
    : undefined,
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
