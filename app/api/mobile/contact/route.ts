import { NextResponse } from "next/server";
import { z } from "zod";
import { createContactMessage } from "@/lib/db/queries";
import { sendContactMessageEmail } from "@/lib/email/brevo";
import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PHONE_REGEX = /^[+0-9()\-\s]{6,20}$/;
const CONTACT_RATE_LIMIT = {
  limit: 5,
  windowMs: 60 * 60 * 1000,
};

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

async function enforceContactRateLimit(request: Request) {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `mobile-contact:${clientKey}`,
    CONTACT_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  return NextResponse.json(
    {
      message: "Too many contact requests. Please try again later.",
      errors: {},
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": Math.max(
          Math.ceil((resetAt - Date.now()) / 1000),
          1
        ).toString(),
      },
    }
  );
}

export async function POST(request: Request) {
  const rateLimited = await enforceContactRateLimit(request);
  if (rateLimited) {
    return rateLimited;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body.", errors: {} },
      { status: 400 }
    );
  }

  const rawValues = {
    name:
      typeof body === "object" && body && "name" in body
        ? String(body.name ?? "")
        : "",
    email:
      typeof body === "object" && body && "email" in body
        ? String(body.email ?? "")
        : "",
    phone:
      typeof body === "object" && body && "phone" in body
        ? String(body.phone ?? "")
        : "",
    subject:
      typeof body === "object" && body && "subject" in body
        ? String(body.subject ?? "")
        : "",
    message:
      typeof body === "object" && body && "message" in body
        ? String(body.message ?? "")
        : "",
  };

  const values = {
    name: rawValues.name.trim(),
    email: rawValues.email.trim(),
    phone: rawValues.phone.trim(),
    subject: rawValues.subject.trim(),
    message: rawValues.message.trim(),
  };

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      {
        message: "Please review the highlighted fields.",
        values,
        errors: {
          name: fieldErrors.name?.[0] ?? null,
          email: fieldErrors.email?.[0] ?? null,
          phone: fieldErrors.phone?.[0] ?? null,
          subject: fieldErrors.subject?.[0] ?? null,
          message: fieldErrors.message?.[0] ?? null,
        },
      },
      { status: 400 }
    );
  }

  try {
    await createContactMessage({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone.length > 0 ? parsed.data.phone : null,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    sendContactMessageEmail({
      senderName: parsed.data.name,
      senderEmail: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    }).catch((error) => {
      console.error("Failed to dispatch mobile contact form email", error);
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks! We'll reach out soon.",
    });
  } catch (error) {
    const message =
      error instanceof ChatSDKError
        ? String(error.cause ?? error.message ?? "Something went wrong.")
        : "Something went wrong.";
    return NextResponse.json({ message, errors: {} }, { status: 500 });
  }
}
