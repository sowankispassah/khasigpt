import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deletePromotion, PromotionInUseError } from "@/lib/admin/delete-unused-promotion";
import { db } from "@/lib/db/queries";
import { creatorReferral, referralCommission } from "@/lib/db/schema";
import { createReferral, listReferralDashboard, recordReferralPayout } from "@/lib/referrals/service";
import { getReferralSettings } from "@/lib/referrals/settings";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
const pageSchema = z.coerce.number().int().min(1).max(100000).default(1);
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal("payout"), referralId: z.string().uuid(), amount: z.number().int().positive().max(2147483647), currency: z.string().regex(/^[A-Z]{3}$/), note: z.string().max(500).nullable() }),
  z.object({ action: z.literal("reverse"), orderId: z.string().min(1).max(64) }),
]);
function failure(error: unknown) {
  if (error instanceof PromotionInUseError) return NextResponse.json({ error: "promotion_in_use" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid referral values." }, { status: 400 });
  console.error("[admin/referrals] Operation failed.", { message: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ error: "The referral operation could not be confirmed. Retry or refresh this section." }, { status: 503 });
}
export async function DELETE(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    const deleted = await deletePromotion("referral", id);
    return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function GET(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const page = pageSchema.parse(request.nextUrl.searchParams.get("page") ?? 1);
    const [dashboard, settings] = await withTimeout(Promise.all([listReferralDashboard(undefined, page), getReferralSettings()]), 8000);
    return NextResponse.json({ ...dashboard, settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try { const row = await createReferral(await request.json()); return NextResponse.json({ referral: row }, { status: 201 }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const value = mutationSchema.parse(await request.json());
    if (value.action === "status") await db.update(creatorReferral).set({ isActive: value.active }).where(eq(creatorReferral.id, value.id));
    else if (value.action === "payout") await recordReferralPayout({ referralId: value.referralId, amount: value.amount, currency: value.currency, note: value.note, recordedBy: admin.id });
    else await db.transaction(async tx => {
      const [commission] = await tx.select().from(referralCommission).where(eq(referralCommission.orderId, value.orderId));
      if (!commission) throw new Error("Commission not found.");
      await tx.select().from(creatorReferral).where(eq(creatorReferral.id, commission.referralId)).for("update");
      await tx.update(referralCommission).set({ reversed: true }).where(eq(referralCommission.orderId, value.orderId));
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
