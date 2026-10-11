import { expect, test } from "@playwright/test";
import { ContactAttachmentError, contactFilesFromForm, identifyContactFile } from "@/lib/contact/attachment-validation";

test("contact attachments accept a real PDF and reject a spoofed one", async () => {
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "details.pdf", { type: "application/pdf" });
  expect(await identifyContactFile(pdf)).toMatchObject({ name: "details.pdf", mimeType: "application/pdf" });
  const spoofed = new File(["not a PDF"], "details.pdf", { type: "application/pdf" });
  await expect(identifyContactFile(spoofed)).rejects.toMatchObject({ code: "invalid_type" });
});

test("contact form rejects excess files and total bytes before upload", () => {
  const tiny = () => new File(["ok"], "note.txt", { type: "text/plain" });
  const tooMany = new FormData();
  for (let index = 0; index < 4; index++) tooMany.append("attachments", tiny());
  expect(() => contactFilesFromForm(tooMany)).toThrow(ContactAttachmentError);
  const tooLarge = new FormData();
  tooLarge.append("attachments", new File([new Uint8Array(2 * 1024 * 1024)], "first.pdf", { type: "application/pdf" }));
  tooLarge.append("attachments", new File([new Uint8Array(2 * 1024 * 1024)], "second.pdf", { type: "application/pdf" }));
  expect(() => contactFilesFromForm(tooLarge)).toThrow(ContactAttachmentError);
});
