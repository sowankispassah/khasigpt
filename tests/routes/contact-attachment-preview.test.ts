import { expect, test } from "@playwright/test";
import {
  contactAttachmentSignedUrlOptions,
  isContactImageAttachment,
} from "@/lib/contact/attachment-preview";
import { contactImageOrigin } from "@/lib/security/contact-image-origin";

test("support previews allow raster images and reject active content and other files", () => {
  for (const mimeType of ["image/png", "image/jpeg", "image/webp"]) {
    expect(isContactImageAttachment({ mimeType })).toBe(true);
    expect(contactAttachmentSignedUrlOptions({ name: "image", mimeType }, "inline")).toEqual({
      download: false,
    });
  }
  for (const mimeType of [
    "image/svg+xml",
    "text/html",
    "application/pdf",
    "text/plain",
    "image/gif",
    "",
  ]) {
    expect(isContactImageAttachment({ mimeType })).toBe(false);
    expect(() => contactAttachmentSignedUrlOptions({ name: "file", mimeType }, "inline")).toThrow(
      "Unsupported attachment preview",
    );
  }
});

test("support attachment links retain named downloads by default", () => {
  const attachment = { name: "screenshot.png", mimeType: "image/png" };
  expect(contactAttachmentSignedUrlOptions(attachment)).toEqual({ download: attachment.name });
  expect(contactAttachmentSignedUrlOptions(attachment, "download")).toEqual({
    download: attachment.name,
  });
});

test("image policy permits only the configured HTTPS storage origin", () => {
  expect(contactImageOrigin("https://project.supabase.co/storage/v1")).toBe("https://project.supabase.co");
  for (const value of [undefined, "", "not a url", "http://project.supabase.co", "https://user:password@project.supabase.co", "data:text/plain,hello", "https://project.supabase.co; script-src *"]) {
    expect(contactImageOrigin(value)).toBe("");
  }
});
