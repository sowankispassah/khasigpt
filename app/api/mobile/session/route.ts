import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { ensureOAuthUser } from "@/lib/db/queries";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Auth secret missing on server" },
      { status: 500 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Supabase server credentials missing" },
      { status: 500 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Invalid content type" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as { access_token?: string };
  const accessToken =
    typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) {
    return NextResponse.json(
      { error: "access_token is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return NextResponse.json(
      { error: "Invalid Supabase access token" },
      { status: 401 }
    );
  }

  const email = data.user.email;
  const provider = data.user.app_metadata?.provider as string | undefined;
  if (!email) {
    return NextResponse.json(
      { error: "Supabase user email missing" },
      { status: 400 }
    );
  }

  if (provider && provider !== "google") {
    return NextResponse.json(
      { error: "Only Google sign-in is supported for mobile SSO" },
      { status: 403 }
    );
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

  const dbUser = await ensureOAuthUser(email, {
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
  });

  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  };

  const response = NextResponse.json({ ok: true });
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
