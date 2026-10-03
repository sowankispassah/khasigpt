"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ContactAttachmentError, contactFilesFromForm } from "@/lib/contact/attachment-validation";
import { deleteContactFiles, uploadContactFiles } from "@/lib/contact/attachments";
import { createContactMessage } from "@/lib/db/queries";
import { sendContactMessageEmail } from "@/lib/email/brevo";
import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const PHONE_REGEX = /^[+0-9()\-\s]{6,20}$/;

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Enter a valid email address."),
  phone: z
    .string()
    .refine((value) => value.length === 0 || PHONE_REGEX.test(value), {
      message:
        "Enter a valid phone number (6-20 characters, numbers and +()- allowed).",
    }),
  subject: z
    .string()
    .min(3, "Subject must be at least 3 characters.")
    .max(120, "Subject must be 120 characters or less."),
  message: z.string().min(10, "Message must be at least 10 characters."),
});

type ContactFormValues = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

type ContactFormErrors = Partial<
  Record<keyof ContactFormValues, string | null>
>;

export type ContactFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      values: ContactFormValues;
      errors: ContactFormErrors;
      attachmentError?: ContactAttachmentError["code"];
      errorCode?: "rate_limited";
    };

export async function submitContactFormAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  try {
    const rawValues: ContactFormValues = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
    };

    const normalizedValues: ContactFormValues = {
      name: rawValues.name.trim(),
      email: rawValues.email.trim(),
      phone: rawValues.phone.trim(),
      subject: rawValues.subject.trim(),
      message: rawValues.message.trim(),
    };

    const parsed = contactSchema.safeParse(normalizedValues);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;

      return {
        status: "error",
        message: "Please review the highlighted fields.",
        values: normalizedValues,
        errors: {
          name: fieldErrors.name?.[0] ?? null,
          email: fieldErrors.email?.[0] ?? null,
          phone: fieldErrors.phone?.[0] ?? null,
          subject: fieldErrors.subject?.[0] ?? null,
          message: fieldErrors.message?.[0] ?? null,
        },
      };
    }

    const requestHeaders = await headers();
    const rateLimit = await incrementRateLimit(`web-contact:${getClientKeyFromHeaders(requestHeaders)}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rateLimit.allowed) return { status: "error", message: "Too many contact requests. Please try again later.", errorCode: "rate_limited", values: normalizedValues, errors: {} };

    const files = contactFilesFromForm(formData);
    const id = crypto.randomUUID();
    const attachments = await uploadContactFiles(files, "contact", id);
    try {
      await createContactMessage({
        id,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone.length > 0 ? parsed.data.phone : null,
        subject: parsed.data.subject,
        message: parsed.data.message,
        attachments,
      });
    } catch (error) {
      await deleteContactFiles(attachments);
      throw error;
    }

    try {
      await sendContactMessageEmail({
        senderName: parsed.data.name,
        senderEmail: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        attachments,
      });
    } catch (error) {
      console.error("Failed to dispatch contact form email", error);
    }

    return {
      status: "success",
      message: "Thanks! We'll reach out soon.",
    };
  } catch (error) {
    const cause =
      error instanceof ChatSDKError
        ? String(error.cause ?? error.message ?? "Something went wrong.")
        : error instanceof ContactAttachmentError
          ? "Please check your attachments."
          : "Something went wrong.";

    return {
      status: "error",
      message: cause,
      values: {
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        subject: String(formData.get("subject") ?? "").trim(),
        message: String(formData.get("message") ?? "").trim(),
      },
      errors: {},
      ...(error instanceof ContactAttachmentError ? { attachmentError: error.code } : {}),
    };
  }
}
