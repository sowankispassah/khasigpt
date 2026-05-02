import { NextResponse } from "next/server";
import {
  createAuditLogEntry,
  ensureOAuthUser,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { verifyMobileGoogleOAuthState } from "@/lib/mobile-google-oauth-state";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  family_name?: string;
  given_name?: string;
  name?: string;
  picture?: string;
};

const MAX_OAUTH_ERROR_DETAIL_LENGTH = 180;

function redirectToApp(params: Record<string, string>) {
  const url = new URL("khasigpt://oauth-complete");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function splitFullName(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function normalizeOAuthError(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "unknown";
}

function sanitizeOAuthErrorDetail(value: string | undefined) {
  const detail = value?.trim();
  if (!detail) {
    return undefined;
  }
  return detail
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_OAUTH_ERROR_DETAIL_LENGTH);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return redirectToApp({ error: oauthError });
  }

  const statePayload = verifyMobileGoogleOAuthState(state);
  if (!code || !statePayload) {
    return redirectToApp({ error: "invalid_oauth_state" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectToApp({ error: "google_not_configured" });
  }

  try {
    const redirectUri = `${requestUrl.origin}/api/mobile/auth/google-callback`;
    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody,
    });
    const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      const tokenError = normalizeOAuthError(tokenPayload.error);
      const tokenDetail = sanitizeOAuthErrorDetail(
        tokenPayload.error_description
      );
      console.error("[mobile-google-oauth] Token exchange failed.", {
        error: tokenPayload.error,
        description: tokenPayload.error_description,
        redirectUri,
        status: tokenResponse.status,
      });
      return redirectToApp({
        error: `token_exchange_${tokenError}`,
        ...(tokenDetail ? { detail: tokenDetail } : {}),
      });
    }

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
        },
      }
    );
    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
    if (
      !userInfoResponse.ok ||
      !userInfo.email ||
      userInfo.email_verified === false
    ) {
      return redirectToApp({ error: "google_email_unverified" });
    }

    const fallbackName = splitFullName(userInfo.name);
    const { user, isNewUser } = await ensureOAuthUser(userInfo.email, {
      image: userInfo.picture ?? null,
      firstName: userInfo.given_name?.trim() || fallbackName.firstName,
      lastName: userInfo.family_name?.trim() || fallbackName.lastName,
    });

    const clientInfo = await getClientInfoFromHeaders();
    createAuditLogEntry({
      actorId: user.id,
      action: isNewUser ? "user.signup" : "user.login",
      target: {
        userId: user.id,
        email: user.email ?? userInfo.email,
      },
      metadata: {
        provider: "google",
        type: "oauth",
        client: "native",
        isNewUser,
      },
      subjectUserId: user.id,
      ...clientInfo,
    }).catch((error) => {
      console.error("[mobile-google-oauth] Failed to record audit log.", error);
    });

    return redirectToApp({
      token: createMobileAuthToken(user.id, { persistent: true }),
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      console.error("[mobile-google-oauth] Callback failed with app error.", {
        type: error.type,
        surface: error.surface,
        cause: error.cause,
      });

      if (error.cause === "account_inactive") {
        return redirectToApp({ error: "account_inactive" });
      }

      return redirectToApp({
        error:
          error.surface === "database"
            ? "oauth_database_failed"
            : "oauth_account_failed",
      });
    }
    console.error("[mobile-google-oauth] Callback failed.", error);
    return redirectToApp({ error: "oauth_callback_failed" });
  }
}
