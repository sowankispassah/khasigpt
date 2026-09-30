import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ContactAttachmentError, contactFilesFromForm } from "@/lib/contact/attachment-validation";
import { deleteContactFiles, uploadContactFiles } from "@/lib/contact/attachments";
import { contactConversationEntrySchema } from "@/lib/contact/conversation-entry-input";
import { listContactReplies, saveContactInternalNote, sendContactReply } from "@/lib/db/contact-replies";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400, headers: noStore });
  try {
    const replies = await listContactReplies(id.data);
    if (!replies) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ replies }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to load replies" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-contact-reply:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 20, windowMs: 60_000 }
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, {
    status: 429, headers: { ...noStore, "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
  });
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) return NextResponse.json({ error: "Attachments are too large", attachmentError: "too_large" }, { status: 413, headers: noStore });
  let input: unknown;
  let files: File[] = [];
  try {
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      files = contactFilesFromForm(formData);
      input = Object.fromEntries(["id", "requestId", "body", "kind"].map((key) => [key, formData.get(key)]));
      if (!formData.has("kind")) (input as Record<string, unknown>).kind = "public_reply";
    } else {
      input = await request.json();
    }
  } catch (error) {
    return NextResponse.json({ error: "Invalid attachment", ...(error instanceof ContactAttachmentError ? { attachmentError: error.code } : {}) }, { status: 400, headers: noStore });
  }
  const parsed = contactConversationEntrySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reply" }, { status: 400, headers: noStore });
  if (!parsed.data.body && !files.length) return NextResponse.json({ error: "Reply is empty" }, { status: 400, headers: noStore });
  try {
    const attachments = await uploadContactFiles(files, "reply", parsed.data.requestId);
    const saveEntry = parsed.data.kind === "internal_note" ? saveContactInternalNote : sendContactReply;
    const result = await saveEntry({
      messageId: parsed.data.id,
      requestId: parsed.data.requestId,
      actorUserId: admin.id,
      body: parsed.data.body,
      attachments,
    });
    if (!result || result.deliveryStatus === "invalid_recipient") await deleteContactFiles(attachments);
    if (!result) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    if (result.deliveryStatus === "invalid_recipient") return NextResponse.json({ error: "Invalid recipient email" }, { status: 422, headers: noStore });
    if (result.deliveryStatus === "invalid_request") return NextResponse.json({ error: "Reply request ID already used" }, { status: 409, headers: noStore });
    return NextResponse.json(result, { status: result.deliveryStatus === "sent" || result.deliveryStatus === "saved" ? 200 : 202, headers: noStore });
  } catch (error) {
    if (error instanceof ContactAttachmentError) return NextResponse.json({ error: "Unable to upload attachment", attachmentError: error.code }, { status: error.code === "upload_failed" ? 503 : 400, headers: noStore });
    return NextResponse.json({ error: parsed.data.kind === "internal_note" ? "Unable to save internal note" : "Unable to confirm reply delivery" }, { status: 500, headers: noStore });
  }
}
