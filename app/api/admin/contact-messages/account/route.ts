import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContactAccountSummary } from "@/lib/db/contact-account";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });

  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400, headers: noStore });

  try {
    const account = await getContactAccountSummary(id.data);
    if (account === undefined) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ account }, { headers: noStore });
  } catch (error) {
    console.error("[admin.contacts] Account lookup failed.", { reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Unable to load account" }, { status: 503, headers: noStore });
  }
}
