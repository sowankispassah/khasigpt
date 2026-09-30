export const MAX_CONTACT_FILES = 3;
export const MAX_CONTACT_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_CONTACT_TOTAL_BYTES = 3 * 1024 * 1024;
export const CONTACT_FILE_TYPES: Record<string, { mimeType: string; extension: string }> = {
  ".pdf": { mimeType: "application/pdf", extension: "pdf" },
  ".png": { mimeType: "image/png", extension: "png" },
  ".jpg": { mimeType: "image/jpeg", extension: "jpg" },
  ".jpeg": { mimeType: "image/jpeg", extension: "jpg" },
  ".webp": { mimeType: "image/webp", extension: "webp" },
  ".txt": { mimeType: "text/plain", extension: "txt" },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
};

export class ContactAttachmentError extends Error {
  constructor(public readonly code: "too_many" | "too_large" | "invalid_type" | "upload_failed") {
    super(code);
  }
}

function safeName(name: string) {
  return Array.from(name, (character) => character.charCodeAt(0) < 32 || /[\\/<>"“”]/.test(character) ? "_" : character).join("").trim().slice(0, 120) || "attachment";
}

export async function identifyContactFile(file: File) {
  const name = safeName(file.name);
  const type = CONTACT_FILE_TYPES[name.slice(name.lastIndexOf(".")).toLowerCase()];
  if (!type || !file.size) throw new ContactAttachmentError("invalid_type");
  if (file.size > MAX_CONTACT_FILE_BYTES) throw new ContactAttachmentError("too_large");
  if (file.type && file.type !== "application/octet-stream" && file.type !== type.mimeType && !(type.mimeType === "image/jpeg" && file.type === "image/jpg")) {
    throw new ContactAttachmentError("invalid_type");
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  const valid = type.extension === "pdf" ? starts(0x25, 0x50, 0x44, 0x46)
    : type.extension === "png" ? starts(0x89, 0x50, 0x4e, 0x47)
    : type.extension === "jpg" ? starts(0xff, 0xd8, 0xff)
    : type.extension === "webp" ? starts(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
    : type.extension === "docx" ? starts(0x50, 0x4b)
    : !header.includes(0);
  if (!valid) throw new ContactAttachmentError("invalid_type");
  return { name, ...type };
}

export function contactFilesFromForm(formData: FormData): File[] {
  const files = formData.getAll("attachments").filter((value): value is File => value instanceof File && (value.size > 0 || value.name.length > 0));
  if (files.length > MAX_CONTACT_FILES) throw new ContactAttachmentError("too_many");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_CONTACT_TOTAL_BYTES) throw new ContactAttachmentError("too_large");
  return files;
}
