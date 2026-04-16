"use server";

import { z } from "zod";
import { createContactMessage } from "@/lib/db/queries";
import { sendContactMessageEmail } from "@/lib/email/brevo";
import { ChatSDKError } from "@/lib/errors";

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

    await createContactMessage({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone.length > 0 ? parsed.data.phone : null,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    (async () => {
      try {
        await sendContactMessageEmail({
          senderName: parsed.data.name,
          senderEmail: parsed.data.email,
          subject: parsed.data.subject,
          message: parsed.data.message,
        });
      } catch (error) {
        console.error("Failed to dispatch contact form email", error);
      }
    })();

    return {
      status: "success",
      message: "Thanks! We'll reach out soon.",
    };
  } catch (error) {
    const cause =
      error instanceof ChatSDKError
        ? String(error.cause ?? error.message ?? "Something went wrong.")
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
    };
  }
}
