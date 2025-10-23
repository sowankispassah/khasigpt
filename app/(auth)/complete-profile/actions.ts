"use server";

import { z } from "zod";

import { auth } from "../auth";
import { updateUserDateOfBirth } from "@/lib/db/queries";

export type CompleteProfileState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

const dobSchema = z.object({
  dob: z
    .string({ required_error: "Please select your date of birth." })
    .refine((value) => Boolean(value && value.trim().length > 0), {
      message: "Please select your date of birth.",
    }),
});

function isAtLeast13YearsOld(dateString: string) {
  const dob = new Date(dateString);
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

export async function submitDateOfBirthAction(
  _prevState: CompleteProfileState,
  formData: FormData
): Promise<CompleteProfileState> {
  const session = await auth();

  if (!session?.user) {
    return { status: "error", message: "You need to sign in first." };
  }

  const parsed = dobSchema.safeParse({ dob: formData.get("dob") });

  if (!parsed.success) {
    const [error] = parsed.error.issues;
    return { status: "error", message: error?.message ?? "Invalid input." };
  }

  if (!isAtLeast13YearsOld(parsed.data.dob)) {
    return {
      status: "error",
      message: "You must be at least 13 years old to use this service.",
    };
  }

  await updateUserDateOfBirth({
    id: session.user.id,
    dateOfBirth: parsed.data.dob,
  });

  return { status: "success" };
}
