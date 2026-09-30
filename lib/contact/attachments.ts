import "server-only";

import { CONTACT_FILE_TYPES, ContactAttachmentError, identifyContactFile, MAX_CONTACT_FILE_BYTES, MAX_CONTACT_FILES } from "@/lib/contact/attachment-validation";
import type { ContactAttachment } from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const BUCKET = "contact-attachments";

async function ensureBucket() {
  const storage = createSupabaseAdminClient().storage;
  const { data, error } = await storage.getBucket(BUCKET);
  if (data) {
    if (data.public) throw new ContactAttachmentError("upload_failed");
    return storage;
  }
  if (error && !/not found/i.test(error.message)) throw new ContactAttachmentError("upload_failed");
  const created = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: `${MAX_CONTACT_FILE_BYTES}`, allowedMimeTypes: [...new Set(Object.values(CONTACT_FILE_TYPES).map((type) => type.mimeType))] });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw new ContactAttachmentError("upload_failed");
  return storage;
}

export async function uploadContactFiles(files: File[], scope: "contact" | "reply", scopeId: string): Promise<ContactAttachment[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_CONTACT_FILES) throw new ContactAttachmentError("too_many");
  const identified = await Promise.all(files.map(identifyContactFile));
  const storage = await ensureBucket();
  const attachments: ContactAttachment[] = [];
  const uploadedPaths: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const info = identified[index];
      const id = `${scopeId}-${index}`;
      const path = `${scope}/${scopeId}/${index}.${info.extension}`;
      const { error } = await storage.from(BUCKET).upload(path, file, { contentType: info.mimeType, upsert: false });
      if (error && !/already exists|duplicate/i.test(error.message)) throw error;
      if (!error) uploadedPaths.push(path);
      attachments.push({ id, name: info.name, mimeType: info.mimeType, size: file.size, path });
    }
    return attachments;
  } catch {
    if (uploadedPaths.length) await storage.from(BUCKET).remove(uploadedPaths);
    throw new ContactAttachmentError("upload_failed");
  }
}

export async function deleteContactFiles(attachments: ContactAttachment[]) {
  if (attachments.length) await createSupabaseAdminClient().storage.from(BUCKET).remove(attachments.map((file) => file.path));
}

export async function signedContactAttachmentUrl(attachment: ContactAttachment) {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(attachment.path, 60, { download: attachment.name });
  if (error || !data?.signedUrl) throw new Error("Unable to open attachment");
  return data.signedUrl;
}

export async function contactAttachmentEmailParts(attachments: ContactAttachment[]) {
  if (!attachments.length) return [];
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  return Promise.all(attachments.map(async (attachment) => {
    const { data, error } = await storage.download(attachment.path);
    if (error || !data) throw new Error("Unable to read contact attachment");
    return { name: attachment.name, content: Buffer.from(await data.arrayBuffer()).toString("base64") };
  }));
}
