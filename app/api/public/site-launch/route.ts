import { NextResponse } from "next/server";
import {
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [
      publicLaunchedSetting,
      underMaintenanceSetting,
      inviteOnlyPrelaunchSetting,
    ] = await Promise.all([
      getAppSetting<string | boolean | number>(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
      getAppSetting<string | boolean | number>(
        SITE_UNDER_MAINTENANCE_SETTING_KEY
      ),
      getAppSetting<string | boolean | number>(
        SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY
      ),
    ]);
    const publicLaunched = parseBooleanSetting(publicLaunchedSetting, true);
    const underMaintenance = parseBooleanSetting(underMaintenanceSetting, false);
    const inviteOnlyPrelaunch = parseBooleanSetting(
      inviteOnlyPrelaunchSetting,
      false
    );

    return NextResponse.json(
      { publicLaunched, underMaintenance, inviteOnlyPrelaunch },
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
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
