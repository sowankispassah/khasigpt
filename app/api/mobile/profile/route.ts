import { getDownloadUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { unstable_update } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  getActiveUserProfileImage,
  getUserById,
  updateUserProfileFields,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { withTimeout } from "@/lib/utils/async";
import {
  DATE_OF_BIRTH_LOCK_MESSAGE,
  isDateOfBirthChangeBlocked,
} from "@/lib/utils/date-of-birth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const profilePatchSchema = z.object({
  dateOfBirth: z.string().trim().min(4).optional(),
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().min(1).max(64).optional(),
});

const PROFILE_LOOKUP_TIMEOUT_MS = 1500;
const PROFILE_UPDATE_TIMEOUT_MS = 4000;
const PROFILE_AUDIT_TIMEOUT_MS = 1500;

function isAtLeast13YearsOld(dateString: string) {
  const dob = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return false;
  }
  const today = new Date();
  const minAllowed = new Date(
    today.getFullYear() - 13,
    today.getMonth(),
    today.getDate()
  );
  return dob <= minAllowed;
}

async function getAvatar(userId: string) {
  const activeImage = await getActiveUserProfileImage({ userId });
  const imageUrl = activeImage?.imageUrl ?? null;
  if (!imageUrl) {
    return null;
  }
  try {
    return getDownloadUrl(imageUrl);
  } catch {
    return /^(data:|https?:\/\/)/.test(imageUrl) ? imageUrl : null;
  }
}

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const [currentUser, avatar] = await Promise.all([
    getUserById(session.user.id),
    getAvatar(session.user.id),
  ]);

  if (!currentUser) {
    return new ChatSDKError("not_found:api", "User not found.").toResponse();
  }

  return NextResponse.json(
    {
      user: {
        id: currentUser.id,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        name: [currentUser.firstName, currentUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
        dateOfBirth: currentUser.dateOfBirth,
        role: currentUser.role,
        allowPersonalKnowledge: currentUser.allowPersonalKnowledge ?? false,
        avatar,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function PATCH(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const parsed = profilePatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid profile data." },
      { status: 400 }
    );
  }

  const dateOfBirth = parsed.data.dateOfBirth;
  if (typeof dateOfBirth !== "undefined" && !isAtLeast13YearsOld(dateOfBirth)) {
    return NextResponse.json(
      { error: "You must be at least 13 years old to use this service." },
      { status: 400 }
    );
  }

  let updated: Awaited<ReturnType<typeof updateUserProfileFields>> | null = null;
  try {
    updated = await withTimeout(
      updateUserProfileFields({
        id: session.user.id,
        dateOfBirth,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      }),
      PROFILE_UPDATE_TIMEOUT_MS,
      () => {
        console.error("[api/mobile/profile] Profile update timed out.", {
          timeoutMs: PROFILE_UPDATE_TIMEOUT_MS,
          userId: session.user.id,
        });
      }
    );
  } catch (error) {
    console.error("[api/mobile/profile] Failed to update user profile.", {
      userId: session.user.id,
      error,
    });
    return NextResponse.json(
      {
        error:
          "Profile service is taking too long. Please wait a moment and try again.",
      },
      { status: 503 }
    );
  }

  if (!updated) {
    const currentUser = await withTimeout(
      getUserById(session.user.id),
      PROFILE_LOOKUP_TIMEOUT_MS,
      () => {
        console.error("[api/mobile/profile] Fallback profile lookup timed out.", {
          timeoutMs: PROFILE_LOOKUP_TIMEOUT_MS,
          userId: session.user.id,
        });
      }
    ).catch((error) => {
      console.error("[api/mobile/profile] Failed to load user profile fallback.", {
        userId: session.user.id,
        error,
      });
      return null;
    });

    if (!currentUser) {
      return new ChatSDKError("not_found:api", "User not found.").toResponse();
    }

    if (isDateOfBirthChangeBlocked(currentUser.dateOfBirth, dateOfBirth)) {
      return NextResponse.json(
        { error: DATE_OF_BIRTH_LOCK_MESSAGE },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Profile service is taking too long. Please wait a moment and try again.",
      },
      { status: 503 }
    );
  }

  const clientInfo = await getClientInfoFromHeaders();
  void withTimeout(
    createAuditLogEntry({
      actorId: session.user.id,
      action: "user.profile.update",
      target: { userId: session.user.id },
      metadata: { client: "native" },
      subjectUserId: session.user.id,
      ...clientInfo,
    }),
    PROFILE_AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/mobile/profile] Failed to write profile audit log.", {
      userId: session.user.id,
      error,
    });
  });

  await unstable_update({
    user: {
      dateOfBirth: updated.dateOfBirth,
      firstName: updated.firstName,
      lastName: updated.lastName,
      name: [updated.firstName, updated.lastName].filter(Boolean).join(" "),
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      dateOfBirth: updated.dateOfBirth,
    },
  });
}
