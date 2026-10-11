import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { creatorReferralDashboard } from "@/lib/referrals/creator-dashboard";
import { listReferralDashboard } from "@/lib/referrals/service";
import { getReferralSettings } from "@/lib/referrals/settings";
import { withTimeout } from "@/lib/utils/async";

export async function GET(request: Request) {
  const session = request.headers.get("authorization") ? await getMobileSession(request) : await auth();
  if (session?.user.role !== "creator") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const page = z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get("page") ?? 1);
    const [settings, dashboard] = await withTimeout(Promise.all([getReferralSettings(), listReferralDashboard(session.user.id, page, false)]), 7000);
    return NextResponse.json(creatorReferralDashboard(dashboard, settings.referralAccessMode === "enabled"), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Referral information is unavailable. Please retry." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
