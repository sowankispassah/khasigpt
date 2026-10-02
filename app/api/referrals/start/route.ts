import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { normalizeReferralCode, REFERRAL_COOKIE } from "@/lib/referrals/rules";
import { getReferralByCode } from "@/lib/referrals/service";
import { getReferralSettings } from "@/lib/referrals/settings";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = normalizeReferralCode(url.searchParams.get("code"));
  if (!code) return NextResponse.json({ error: "Invalid referral." }, { status: 400 });
  const [referral, settings, session] = await Promise.all([getReferralByCode(code), getReferralSettings(), auth()]);
  if (!referral || settings.referralAccessMode === "disabled" || (settings.referralAccessMode === "admin_only" && session?.user.role !== "admin")) return NextResponse.json({ error: "Referral unavailable." }, { status: 404 });
  const response = NextResponse.redirect(new URL("/register", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(REFERRAL_COOKIE, code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return response;
}
