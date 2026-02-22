import { compare } from "bcrypt-ts";
import { NextResponse } from "next/server";
import {
  ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS,
  ADMIN_ENTRY_PASS_COOKIE_NAME,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  createAdminEntryPassToken,
  normalizeAdminEntryCodeInput,
} from "@/lib/security/admin-entry-pass";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

export const runtime = "nodejs";

const ADMIN_ENTRY_RATE_LIMIT_MAX = 10;
const ADMIN_ENTRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function getEnvAdminEntryCode() {
  return normalizeAdminEntryCodeInput(process.env.SITE_ADMIN_ENTRY_CODE ?? null);
}

async function resolveSubmittedCode(code: string) {
  const envCode = getEnvAdminEntryCode();
  if (envCode && envCode === code) {
    return true;
  }

  const storedCodeHash = await getAppSetting<string | null>(
    SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY
  );
  if (typeof storedCodeHash !== "string" || storedCodeHash.trim().length === 0) {
    return false;
  }

  return compare(code, storedCodeHash);
}

export async function POST(request: Request) {
  const rateLimitKey = `admin-entry:${getClientKeyFromHeaders(request.headers)}`;
  const { allowed, resetAt } = await incrementRateLimit(rateLimitKey, {
    limit: ADMIN_ENTRY_RATE_LIMIT_MAX,
    windowMs: ADMIN_ENTRY_RATE_LIMIT_WINDOW_MS,
  });

  if (!allowed) {
    const retryAfter = Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1);
    return NextResponse.json(
      {
        code: "rate_limit:admin_entry",
        message: "Too many attempts. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { code?: unknown }
    | null;
  const code = normalizeAdminEntryCodeInput(body?.code);
  if (!code) {
    return NextResponse.json(
      {
        error: "invalid_code",
        message: "Please enter a valid admin access code.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const [publicLaunchedSetting, underMaintenanceSetting, adminAccessEnabledSetting] =
    await Promise.all([
      getAppSetting<string | boolean | number>(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
      getAppSetting<string | boolean | number>(SITE_UNDER_MAINTENANCE_SETTING_KEY),
      getAppSetting<string | boolean | number>(SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY),
    ]);

  const publicLaunched = parseBooleanSetting(publicLaunchedSetting, true);
  const underMaintenance = parseBooleanSetting(underMaintenanceSetting, false);
  const adminAccessEnabled = parseBooleanSetting(adminAccessEnabledSetting, false);

  if (!adminAccessEnabled) {
    return NextResponse.json(
      {
        error: "admin_entry_disabled",
        message: "Admin access code entry is disabled.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (publicLaunched && !underMaintenance) {
    return NextResponse.json(
      {
        error: "not_required",
        message: "Site is already public. Admin entry is not required.",
      },
      {
        status: 409,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const isValidCode = await resolveSubmittedCode(code).catch(() => false);
  if (!isValidCode) {
    return NextResponse.json(
      {
        error: "invalid_code",
        message: "Invalid admin access code.",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const token = await createAdminEntryPassToken(ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS);
  if (!token) {
    return NextResponse.json(
      {
        error: "admin_entry_unavailable",
        message: "Admin entry pass is not configured.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
  response.cookies.set(ADMIN_ENTRY_PASS_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
