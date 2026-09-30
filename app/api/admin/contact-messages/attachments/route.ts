import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signedContactAttachmentUrl } from "@/lib/contact/attachments";
import { db } from "@/lib/db/queries";
import { type ContactAttachment, contactMessage, contactMessageReply } from "@/lib/db/schema";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  const source = request.nextUrl.searchParams.get("source");
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  if (!id.success || !attachmentId || !["contact", "reply"].includes(source ?? "")) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400, headers: noStore });
  }
  try {
    let files: ContactAttachment[] = [];
    if (source === "contact") {
      const [row] = await db.select({ attachments: contactMessage.attachments }).from(contactMessage)
        .where(and(eq(contactMessage.id, id.data), eq(contactMessage.kind, "contact"))).limit(1);
      files = row?.attachments ?? [];
    } else {
      const [row] = await db.select({ attachments: contactMessageReply.attachments }).from(contactMessageReply)
        .innerJoin(contactMessage, eq(contactMessageReply.messageId, contactMessage.id))
        .where(and(eq(contactMessageReply.id, id.data), eq(contactMessage.kind, "contact"))).limit(1);
      files = row?.attachments ?? [];
    }
    const attachment = Array.isArray(files) ? files.find((file) => file?.id === attachmentId) : null;
    if (!attachment || typeof attachment.path !== "string" || !attachment.path.startsWith(`${source}/${id.data}/`)) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404, headers: noStore });
    }
    const url = await signedContactAttachmentUrl(attachment);
    return NextResponse.redirect(url, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to open attachment" }, { status: 500, headers: noStore });
  }
}
