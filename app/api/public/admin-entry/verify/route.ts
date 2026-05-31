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
import {
  getAppSetting,
  getAppSettingsByKeys,
  getLastKnownAppSettingsByKeys,
} from "@/lib/db/queries";
import {
  createAdminEntryPassToken,
  normalizeAdminEntryCodeInput,
} from "@/lib/security/admin-entry-pass";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const ADMIN_ENTRY_RATE_LIMIT_MAX = 10;
const ADMIN_ENTRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_ENTRY_SETTINGS_TIMEOUT_MS = 2_000;
const ADMIN_ENTRY_GATE_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
] as const;

function getEnvAdminEntryCode() {
  return normalizeAdminEntryCodeInput(process.env.SITE_ADMIN_ENTRY_CODE ?? null);
}

async function resolveSubmittedCode(code: string) {
  const envCode = getEnvAdminEntryCode();
  if (envCode && envCode === code) {
    return true;
  }

  const storedCodeHash = await withTimeout(
    getAppSetting<string | null>(SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY),
    ADMIN_ENTRY_SETTINGS_TIMEOUT_MS
  );
  if (typeof storedCodeHash !== "string" || storedCodeHash.trim().length === 0) {
    return false;
  }

  return compare(code, storedCodeHash);
}

async function loadAdminEntryGateSettings() {
  const rows = await withTimeout(
    getAppSettingsByKeys([...ADMIN_ENTRY_GATE_SETTING_KEYS]),
    ADMIN_ENTRY_SETTINGS_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[api/public/admin-entry/verify] Gate settings read failed; using last known values.",
      error
    );
    return null;
  });

  if (!rows) {
    return getLastKnownAppSettingsByKeys([...ADMIN_ENTRY_GATE_SETTING_KEYS]);
  }

  return new Map(rows.map((row) => [row.key, row.value]));
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

  const gateSettings = await loadAdminEntryGateSettings();
  const publicLaunchedSetting = gateSettings.get(SITE_PUBLIC_LAUNCHED_SETTING_KEY);
  const underMaintenanceSetting = gateSettings.get(SITE_UNDER_MAINTENANCE_SETTING_KEY);
  const adminAccessEnabledSetting = gateSettings.get(
    SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY
  );

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

  const isValidCode = await resolveSubmittedCode(code).catch((error) => {
    console.error(
      "[api/public/admin-entry/verify] Code hash could not be confirmed.",
      error
    );
    return null;
  });
  if (isValidCode === null) {
    return NextResponse.json(
      {
        error: "admin_entry_unavailable",
        message: "Admin access code could not be confirmed. Please try again.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
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
