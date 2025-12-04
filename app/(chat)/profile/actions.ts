"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  updateUserActiveState,
  updateUserName,
  updateUserPassword,
  updateUserLocation,
} from "@/lib/db/queries";
import {
  createPersonalKnowledgeEntry,
  deletePersonalKnowledgeEntry,
  updatePersonalKnowledgeEntry,
} from "@/lib/rag/service";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import type { SanitizedRagEntry } from "@/lib/rag/types";
import { z } from "zod";

async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("unauthorized");
  }

  return session.user;
}

export type UpdatePasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export type UpdateProfileNameState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export type DeactivateAccountState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

const nameSchema = z.object({
  firstName: z
    .string({ required_error: "First name is required." })
    .trim()
    .min(1, "First name is required.")
    .max(64, "First name must be 64 characters or fewer."),
  lastName: z
    .string({ required_error: "Last name is required." })
    .trim()
    .min(1, "Last name is required.")
    .max(64, "Last name must be 64 characters or fewer."),
});

export async function updatePasswordAction(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const user = await requireUser();

  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!password || password.length < 8) {
    return {
      status: "error",
      message: "Password must be at least 8 characters long.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Passwords do not match.",
    };
  }

  const clientInfo = getClientInfoFromHeaders();
  await updateUserPassword({
    id: user.id,
    password,
  });

  await createAuditLogEntry({
    actorId: user.id,
    action: "user.profile.password.update",
    target: { userId: user.id },
    subjectUserId: user.id,
    ...clientInfo,
  });

  revalidatePath("/profile");
  return {
    status: "success",
    message: "Password updated successfully.",
  };
}

export async function updateNameAction(
  _prevState: UpdateProfileNameState,
  formData: FormData
): Promise<UpdateProfileNameState> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    return {
      status: "error",
      message: firstIssue?.message ?? "Invalid input.",
    };
  }

  const clientInfo = getClientInfoFromHeaders();
  await updateUserName({
    id: user.id,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
  });

  await createAuditLogEntry({
    actorId: user.id,
    action: "user.profile.name.update",
    target: { userId: user.id },
    subjectUserId: user.id,
    ...clientInfo,
  });

  revalidatePath("/profile");

  return {
    status: "success",
    message: "Profile updated successfully.",
  };
}

export async function deactivateAccountAction(
  _prevState: DeactivateAccountState,
  formData: FormData
): Promise<DeactivateAccountState> {
  const user = await requireUser();
  void formData;

  const updated = await updateUserActiveState({
    id: user.id,
    isActive: false,
  });

  if (!updated) {
    return {
      status: "error",
      message: "We could not deactivate your account. Please try again.",
    };
  }

  const clientInfo = getClientInfoFromHeaders();
  await createAuditLogEntry({
    actorId: user.id,
    action: "user.account.deactivate",
    target: { userId: user.id },
    subjectUserId: user.id,
    ...clientInfo,
  });

  await signOut({
    redirectTo: "/login?status=account-deactivated",
  });

  return {
    status: "success",
    message: "Account deactivated.",
  };
}

export type PersonalKnowledgeActionResult =
  | { success: true; entry: SanitizedRagEntry }
  | { success: false; error: string };

export async function savePersonalKnowledgeAction(input: {
  id?: string | null;
  title: string;
  content: string;
}): Promise<PersonalKnowledgeActionResult> {
  const user = await requireUser();

  if (!user.allowPersonalKnowledge) {
    return {
      success: false,
      error: "Personal knowledge is not enabled for your account.",
    };
  }

  const clientInfo = getClientInfoFromHeaders();
  const title = input.title?.trim() ?? "";
  const content = input.content?.trim() ?? "";

  if (title.length < 3) {
    return { success: false, error: "Title must be at least 3 characters long." };
  }
  if (content.length < 16) {
    return {
      success: false,
      error: "Content must be at least 16 characters long.",
    };
  }

  try {
    const entry = input.id
      ? await updatePersonalKnowledgeEntry({
          userId: user.id,
          entryId: input.id,
          title,
          content,
        })
      : await createPersonalKnowledgeEntry({
          userId: user.id,
          title,
          content,
        });

    await createAuditLogEntry({
      actorId: user.id,
      action: input.id
        ? "user.personal_knowledge.update"
        : "user.personal_knowledge.create",
      target: { entryId: entry.id },
      subjectUserId: user.id,
      ...clientInfo,
    });

    revalidatePath("/profile");

    return { success: true, entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save entry.";
    return { success: false, error: message };
  }
}

export type DeletePersonalKnowledgeResult =
  | { success: true }
  | { success: false; error: string };

export async function updateUserLocationAction(input: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const clientInfo = getClientInfoFromHeaders();

  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  const accuracy = Number(input.accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: "Invalid coordinates" };
  }

  try {
    await updateUserLocation({
      id: user.id,
      latitude: lat,
      longitude: lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      consent: true,
    });

    await createAuditLogEntry({
      actorId: user.id,
      action: "user.location.update",
      target: { userId: user.id },
      metadata: {
        latitude: lat,
        longitude: lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      },
      subjectUserId: user.id,
      ...clientInfo,
    });

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save location";
    return { success: false, error: message };
  }
}

export async function deletePersonalKnowledgeAction({
  entryId,
}: {
  entryId: string;
}): Promise<DeletePersonalKnowledgeResult> {
  const user = await requireUser();

  if (!user.allowPersonalKnowledge) {
    return {
      success: false,
      error: "Personal knowledge is not enabled for your account.",
    };
  }

  const clientInfo = getClientInfoFromHeaders();
  try {
    await deletePersonalKnowledgeEntry({
      entryId,
      actorId: user.id,
    });

    await createAuditLogEntry({
      actorId: user.id,
      action: "user.personal_knowledge.delete",
      target: { entryId },
      subjectUserId: user.id,
      ...clientInfo,
    });

    revalidatePath("/profile");

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete entry.";
    return { success: false, error: message };
  }
}
