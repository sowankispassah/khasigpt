import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyUserEmailByToken } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ token: z.string().trim().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: "not_found" }, { status: 400 });
  }
  const result = await verifyUserEmailByToken(parsed.data.token);
  // The query result carries the full User row (password hash, role,
  // location); the app only needs the verification status.
  return NextResponse.json(
    { status: result.status },
    { headers: { "Cache-Control": "no-store" } }
  );
}
