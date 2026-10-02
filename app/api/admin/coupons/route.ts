import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deletePromotion, PromotionInUseError } from "@/lib/admin/delete-unused-promotion";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export async function DELETE(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    const deleted = await deletePromotion("coupon", id);
    return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof PromotionInUseError ? 409 : error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: status === 409 ? "promotion_in_use" : "Operation could not be confirmed." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
