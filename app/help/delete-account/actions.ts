"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAccountDeletionRequestRecord,
  createAuditLogEntry,
} from "@/lib/db/queries";
import { sendAccountDeletionVerificationEmail } from "@/lib/email/brevo";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const reasonSchema = z.enum([
  "no_longer_using",
  "privacy_concerns",
  "duplicate_account",
  "prefer_not_to_say",
  "other",
]);

const deletionRequestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(128, "Full name must be 128 characters or fewer."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(128, "Email address must be 128 characters or fewer."),
  usernameOrUserId: z
    .string()
    .trim()
    .max(128, "Username or user ID must be 128 characters or fewer.")
    .optional()
    .or(z.literal("")),
  reason: reasonSchema,
  notes: z
    .string()
    .trim()
    .max(2000, "Additional comments must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  permanentAcknowledge: z.string().refine((value) => value === "on", {
    message:
      "You must acknowledge that account deletion is permanent and cannot be undone.",
  }),
  dataAcknowledge: z.string().refine((value) => value === "on", {
    message:
      "You must acknowledge that associated data may be permanently removed.",
  }),
  website: z.string().optional(),
});

type DeleteAccountValues = {
  fullName: string;
  email: string;
  usernameOrUserId: string;
  reason: string;
  notes: string;
};

type DeleteAccountErrors = Partial<
  Record<keyof DeleteAccountValues | "acknowledgements", string | null>
>;

export type DeleteAccountFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      values: DeleteAccountValues;
      errors: DeleteAccountErrors;
    }
  | {
      status: "success";
      referenceId: string;
      requiresEmailVerification: boolean;
      email: string;
    };

function getBaseUrl(headerStore: Headers) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://khasigpt.com";
}

function valuesFromFormData(formData: FormData): DeleteAccountValues {
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    usernameOrUserId: String(formData.get("usernameOrUserId") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function submitDeleteAccountRequestAction(
  _prevState: DeleteAccountFormState,
  formData: FormData
): Promise<DeleteAccountFormState> {
  const submittedValues = valuesFromFormData(formData);
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.id);
  const headerStore = await headers();
  const clientInfo = await getClientInfoFromHeaders();
  const clientKey = getClientKeyFromHeaders(headerStore);

  if (String(formData.get("website") ?? "").trim().length > 0) {
    return {
      status: "error",
      message: "We could not submit this request. Please try again.",
      values: submittedValues,
      errors: {},
    };
  }

  const parsed = deletionRequestSchema.safeParse({
    ...submittedValues,
    permanentAcknowledge: String(formData.get("permanentAcknowledge") ?? ""),
    dataAcknowledge: String(formData.get("dataAcknowledge") ?? ""),
    website: formData.get("website"),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Please review the highlighted fields.",
      values: submittedValues,
      errors: {
        fullName: flattened.fullName?.[0] ?? null,
        email: flattened.email?.[0] ?? null,
        usernameOrUserId: flattened.usernameOrUserId?.[0] ?? null,
        reason: flattened.reason?.[0] ?? null,
        notes: flattened.notes?.[0] ?? null,
        acknowledgements:
          flattened.permanentAcknowledge?.[0] ??
          flattened.dataAcknowledge?.[0] ??
          null,
      },
    };
  }

  const email = isLoggedIn
    ? (session?.user?.email ?? "").trim().toLowerCase()
    : parsed.data.email.trim().toLowerCase();

  if (!email) {
    return {
      status: "error",
      message:
        "Your signed-in account does not include an email address. Please contact support.",
      values: submittedValues,
      errors: { email: "Email address is required." },
    };
  }

  const rateLimitKeys = [
    isLoggedIn
      ? `account-deletion:user:${session?.user.id}`
      : `account-deletion:email:${email}`,
    `account-deletion:ip:${clientKey}`,
  ];

  for (const key of rateLimitKeys) {
    const result = await incrementRateLimit(key, {
      limit: isLoggedIn ? 3 : 2,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!result.allowed) {
      return {
        status: "error",
        message:
          "Too many deletion requests were submitted recently. Please wait before retrying.",
        values: submittedValues,
        errors: {},
      };
    }
  }

  try {
    const fullName =
      parsed.data.fullName ||
      [session?.user?.firstName, session?.user?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      email;

    const result = await createAccountDeletionRequestRecord({
      fullName,
      email,
      usernameOrUserId: parsed.data.usernameOrUserId || null,
      reason: parsed.data.reason,
      notes: parsed.data.notes || null,
      userId: isLoggedIn ? session?.user.id : null,
      requestSource: isLoggedIn ? "web_authenticated" : "web_email",
      requireEmailVerification: !isLoggedIn,
      clientInfo,
    });

    if (result.verificationToken) {
      const baseUrl = getBaseUrl(headerStore);
      const verificationUrl = `${baseUrl}/help/delete-account/verify?token=${encodeURIComponent(
        result.verificationToken
      )}`;
      await sendAccountDeletionVerificationEmail({
        toEmail: email,
        toName: fullName,
        verificationUrl,
        referenceId: result.request.referenceId,
      });
    } else if (session?.user?.id) {
      await createAuditLogEntry({
        actorId: session.user.id,
        action: "user.account_deletion.request",
        target: {
          userId: session.user.id,
          requestId: result.request.id,
          referenceId: result.request.referenceId,
        },
        subjectUserId: session.user.id,
        ...clientInfo,
      });
    }

    return {
      status: "success",
      referenceId: result.request.referenceId,
      requiresEmailVerification: Boolean(result.verificationToken),
      email,
    };
  } catch (error) {
    const message =
      error instanceof ChatSDKError
        ? String(error.cause ?? error.message)
        : "We could not submit this request. Please try again.";
    return {
      status: "error",
      message,
      values: submittedValues,
      errors: {},
    };
  }
}
