import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { recordInboundContactEmail } from "@/lib/db/contact-replies";
import { contactInboundDomain, parseInboundContactEmails } from "@/lib/email/contact-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function authorized(request: NextRequest, secret: string) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BREVO_INBOUND_WEBHOOK_TOKEN?.trim();
  const domain = contactInboundDomain();
  if (!secret || !domain) return NextResponse.json({ error: "Inbound email is unavailable" }, { status: 503, headers: noStore });
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (Number(request.headers.get("content-length")) > 500_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: noStore });
  }
  const raw = await request.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: noStore });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const emails = parseInboundContactEmails(payload, domain);
  if (!emails) return NextResponse.json({ error: "Invalid inbound payload" }, { status: 400, headers: noStore });
  try {
    let recorded = 0;
    for (const email of emails) {
      if (await recordInboundContactEmail(email) === "recorded") recorded += 1;
    }
    return NextResponse.json({ recorded }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to store inbound email" }, { status: 500, headers: noStore });
  }
}
