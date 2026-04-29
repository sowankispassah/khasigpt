import { getDownloadUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { unstable_update } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  getActiveUserProfileImage,
  getUserById,
  updateUserName,
  updateUserProfile,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
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

  const currentUser = await getUserById(session.user.id);
  if (!currentUser) {
    return new ChatSDKError("not_found:api", "User not found.").toResponse();
  }

  if (
    isDateOfBirthChangeBlocked(currentUser.dateOfBirth, parsed.data.dateOfBirth)
  ) {
    return NextResponse.json(
      { error: DATE_OF_BIRTH_LOCK_MESSAGE },
      { status: 409 }
    );
  }

  const firstName = parsed.data.firstName ?? currentUser.firstName ?? "";
  const lastName = parsed.data.lastName ?? currentUser.lastName ?? "";
  const dateOfBirth = parsed.data.dateOfBirth ?? currentUser.dateOfBirth ?? "";
  const shouldUpdateDateOfBirth =
    typeof parsed.data.dateOfBirth !== "undefined" &&
    parsed.data.dateOfBirth !== currentUser.dateOfBirth;

  if (shouldUpdateDateOfBirth && !isAtLeast13YearsOld(dateOfBirth)) {
    return NextResponse.json(
      { error: "You must be at least 13 years old to use this service." },
      { status: 400 }
    );
  }

  const updated =
    shouldUpdateDateOfBirth
      ? await updateUserProfile({
          id: session.user.id,
          firstName,
          lastName,
          dateOfBirth,
        })
      : await updateUserName({
          id: session.user.id,
          firstName,
          lastName,
        });

  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({
    actorId: session.user.id,
    action: "user.profile.update",
    target: { userId: session.user.id },
    metadata: { client: "native" },
    subjectUserId: session.user.id,
    ...clientInfo,
  });

  await unstable_update({
    user: {
      dateOfBirth: updated?.dateOfBirth ?? dateOfBirth,
      firstName: updated?.firstName ?? firstName,
      lastName: updated?.lastName ?? lastName,
      name: [updated?.firstName ?? firstName, updated?.lastName ?? lastName]
        .filter(Boolean)
        .join(" "),
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    user: {
      id: updated?.id ?? session.user.id,
      email: updated?.email ?? currentUser.email,
      firstName: updated?.firstName ?? firstName,
      lastName: updated?.lastName ?? lastName,
      dateOfBirth: updated?.dateOfBirth ?? dateOfBirth,
    },
  });
}
