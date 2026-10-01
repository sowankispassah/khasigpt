import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isContactImageAttachment } from "@/lib/contact/attachment-preview";
import { signedContactAttachmentUrl } from "@/lib/contact/attachments";
import { withAdminDatabase } from "@/lib/db/admin-database";
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
  const display = z
    .enum(["download", "inline"])
    .safeParse(request.nextUrl.searchParams.get("display") ?? "download");
  if (
    !id.success ||
    !attachmentId ||
    !display.success ||
    !["contact", "reply"].includes(source ?? "")
  ) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400, headers: noStore });
  }
  try {
    const files = await withAdminDatabase(
      "contacts.attachment",
      async (db): Promise<ContactAttachment[]> => {
        if (source === "contact") {
          const [row] = await db
            .select({ attachments: contactMessage.attachments })
            .from(contactMessage)
            .where(and(eq(contactMessage.id, id.data), eq(contactMessage.kind, "contact")))
            .limit(1);
          return row?.attachments ?? [];
        } else {
          const [row] = await db
            .select({ attachments: contactMessageReply.attachments })
            .from(contactMessageReply)
            .innerJoin(contactMessage, eq(contactMessageReply.messageId, contactMessage.id))
            .where(and(eq(contactMessageReply.id, id.data), eq(contactMessage.kind, "contact")))
            .limit(1);
          return row?.attachments ?? [];
        }
      },
    );
    const attachment = Array.isArray(files)
      ? files.find((file) => file?.id === attachmentId)
      : null;
    if (
      !attachment ||
      typeof attachment.path !== "string" ||
      !attachment.path.startsWith(`${source}/${id.data}/`)
    ) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404, headers: noStore },
      );
    }
    if (display.data === "inline" && !isContactImageAttachment(attachment)) {
      return NextResponse.json({ error: "Preview unavailable" }, { status: 400, headers: noStore });
    }
    const url = await signedContactAttachmentUrl(attachment, display.data);
    return NextResponse.redirect(url, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "Unable to open attachment" },
      { status: 500, headers: noStore },
    );
  }
}
