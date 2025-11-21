export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { ensureOAuthUser } from "@/lib/db/queries";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get("access_token");
  const redirectTo = searchParams.get("redirect") ?? "/";
  const redirectUrl = new URL(redirectTo, request.url);

  if (!accessToken) {
    return NextResponse.redirect(redirectUrl);
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user || !data.user.email) {
    return NextResponse.redirect(redirectUrl);
  }

  const provider = data.user.app_metadata?.provider as string | undefined;
  if (provider && provider !== "google") {
    return NextResponse.redirect(redirectUrl);
  }

  const firstName =
    typeof data.user.user_metadata?.given_name === "string"
      ? data.user.user_metadata.given_name
      : null;
  const lastName =
    typeof data.user.user_metadata?.family_name === "string"
      ? data.user.user_metadata.family_name
      : null;
  const image =
    typeof data.user.user_metadata?.avatar_url === "string"
      ? data.user.user_metadata.avatar_url
      : null;

  const dbUser = await ensureOAuthUser(data.user.email, {
    firstName,
    lastName,
    image,
  });

  const tokenPayload = {
    sub: dbUser.id,
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    dateOfBirth: dbUser.dateOfBirth ?? null,
    imageVersion: dbUser.image
      ? new Date().toISOString()
      : dbUser.updatedAt instanceof Date
        ? dbUser.updatedAt.toISOString()
        : null,
    firstName: dbUser.firstName ?? null,
    lastName: dbUser.lastName ?? null,
  };

  const sessionToken = await encode({
    token: tokenPayload,
    secret,
    maxAge: THIRTY_DAYS_SECONDS,
    salt: "authjs.session-token",
  });

  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  };

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(
    secure ? "__Secure-authjs.session-token" : "authjs.session-token",
    sessionToken,
    cookieOptions
  );
  if (secure) {
    response.cookies.set("authjs.session-token", sessionToken, {
      ...cookieOptions,
      secure: false,
    });
  }

  return response;
}
