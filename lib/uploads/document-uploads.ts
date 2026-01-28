export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const DOCUMENT_EXTENSION_BY_MIME: Record<
  (typeof DOCUMENT_MIME_TYPES)[number],
  string
> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const DOCUMENT_UPLOADS_MAX_TEXT_CHARS = 80_000;
export const DOCUMENT_UPLOADS_MAX_BYTES = 5 * 1024 * 1024;

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

export function isDocumentMimeType(value: string): value is DocumentMimeType {
  return DOCUMENT_MIME_TYPES.includes(value as DocumentMimeType);
}

export function parseDocumentUploadsEnabledSetting(
  value: string | boolean | null | undefined
): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}

export function getAttachmentAcceptValue(
  documentUploadsEnabled: boolean
): string {
  const mimeTypes = documentUploadsEnabled
    ? [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES]
    : [...IMAGE_MIME_TYPES];
  return mimeTypes.join(",");
}
