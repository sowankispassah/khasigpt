import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreatorCouponRedemptions, getCreatorCouponSummary } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc") });
const sortMap = { date_desc: { sortBy: "date", sortDirection: "desc" }, date_asc: { sortBy: "date", sortDirection: "asc" }, amount_desc: { sortBy: "payment", sortDirection: "desc" }, amount_asc: { sortBy: "payment", sortDirection: "asc" } } as const;

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) return new ChatSDKError("unauthorized:api").toResponse();
  if (session.user.role !== "creator") return new ChatSDKError("forbidden:api").toResponse();
  const url = new URL(request.url);
  const parsedResult = querySchema.safeParse({ page: url.searchParams.get("page") ?? 1, sort: url.searchParams.get("sort") ?? "date_desc" });
  if (!parsedResult.success) {
    return NextResponse.json({ error: "Invalid creator dashboard query." }, { status: 400 });
  }
  const parsed = parsedResult.data;
  const sort = sortMap[parsed.sort];
  const [summary, redemptions] = await Promise.all([getCreatorCouponSummary(session.user.id), getCreatorCouponRedemptions({ creatorId: session.user.id, page: parsed.page, pageSize: 10, sortBy: sort.sortBy, sortDirection: sort.sortDirection })]);
  return NextResponse.json({ summary, redemptions, sort: parsed.sort }, { headers: { "Cache-Control": "no-store" } });
}
