"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/(auth)/auth";
import { createAuditLogEntry, updateUserPassword } from "@/lib/db/queries";

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

  await updateUserPassword({
    id: user.id,
    password,
  });

  await createAuditLogEntry({
    actorId: user.id,
    action: "user.profile.password.update",
    target: { userId: user.id },
  });

  revalidatePath("/profile");
  return {
    status: "success",
    message: "Password updated successfully.",
  };
}
