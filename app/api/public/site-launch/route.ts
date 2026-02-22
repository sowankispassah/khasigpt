import { NextResponse } from "next/server";
import {
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { normalizeAdminEntryPathSetting } from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

export const runtime = "nodejs";

function getInternalSiteStatusSecret() {
  return (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const [
      publicLaunchedSetting,
      underMaintenanceSetting,
      inviteOnlyPrelaunchSetting,
      adminAccessEnabledSetting,
      adminEntryPathSetting,
    ] = await Promise.all([
      getAppSetting<string | boolean | number>(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
      getAppSetting<string | boolean | number>(
        SITE_UNDER_MAINTENANCE_SETTING_KEY
      ),
      getAppSetting<string | boolean | number>(
        SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY
      ),
      getAppSetting<string | boolean | number>(
        SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY
      ),
      getAppSetting<string>(SITE_ADMIN_ENTRY_PATH_SETTING_KEY),
    ]);
    const publicLaunched = parseBooleanSetting(publicLaunchedSetting, true);
    const underMaintenance = parseBooleanSetting(underMaintenanceSetting, false);
    const inviteOnlyPrelaunch = parseBooleanSetting(
      inviteOnlyPrelaunchSetting,
      false
    );
    const adminAccessEnabled = parseBooleanSetting(
      adminAccessEnabledSetting,
      false
    );
    const adminEntryPath = normalizeAdminEntryPathSetting(adminEntryPathSetting);
    const internalSecret = getInternalSiteStatusSecret();
    const internalHeader = request.headers.get("x-site-gate-secret") ?? "";
    const includeInternalData =
      internalSecret.length > 0
        ? internalHeader === internalSecret
        : process.env.NODE_ENV !== "production";

    const payload: {
      publicLaunched: boolean;
      underMaintenance: boolean;
      inviteOnlyPrelaunch: boolean;
      adminAccessEnabled: boolean;
      adminEntryPath?: string;
    } = {
      publicLaunched,
      underMaintenance,
      inviteOnlyPrelaunch,
      adminAccessEnabled,
    };
    if (includeInternalData) {
      payload.adminEntryPath = adminEntryPath;
    }

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[api/public/site-launch] Failed to resolve site availability. Falling back to defaults.",
      error
    );

    return NextResponse.json(
      {
        publicLaunched: true,
        underMaintenance: false,
        inviteOnlyPrelaunch: false,
        adminAccessEnabled: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
