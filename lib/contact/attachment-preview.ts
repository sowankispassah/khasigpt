import type { ContactAttachment } from "@/lib/db/schema";

export function isContactImageAttachment(attachment: Pick<ContactAttachment, "mimeType">) {
  return ["image/png", "image/jpeg", "image/webp"].includes(attachment.mimeType);
}

export function contactAttachmentSignedUrlOptions(
  attachment: Pick<ContactAttachment, "name" | "mimeType">,
  display: "download" | "inline" = "download",
) {
  if (display === "inline") {
    if (!isContactImageAttachment(attachment)) throw new Error("Unsupported attachment preview");
    return { download: false };
  }
  return { download: attachment.name };
}
