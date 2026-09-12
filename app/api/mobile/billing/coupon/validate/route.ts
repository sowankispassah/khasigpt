import { NextResponse } from "next/server";
import { getCouponByCode } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) return new ChatSDKError("unauthorized:api").toResponse();
  const body = await request.json().catch(() => null);
  const code = typeof body?.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
  if (!code) return NextResponse.json({ error: "Creator coupon is required." }, { status: 400 });
  const coupon = await getCouponByCode(code);
  const now = Date.now();
  if (!coupon || !coupon.isActive || (coupon.validFrom && coupon.validFrom.getTime() > now) || (coupon.validTo && coupon.validTo.getTime() < now)) {
    return NextResponse.json({ error: "Creator coupon is invalid or expired." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, coupon: { code: coupon.code, creatorId: coupon.creatorId } });
}
