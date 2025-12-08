"use server";

import { z } from "zod";
import { updateUserProfile } from "@/lib/db/queries";
import { auth } from "../auth";

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
  firstName: z
    .string({ required_error: "Please enter your first name." })
    .trim()
    .min(1, "Please enter your first name.")
    .max(64, "First name must be 64 characters or fewer."),
  lastName: z
    .string({ required_error: "Please enter your last name." })
    .trim()
    .min(1, "Please enter your last name.")
    .max(64, "Last name must be 64 characters or fewer."),
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

  const parsed = dobSchema.safeParse({
    dob: formData.get("dob"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

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

  await updateUserProfile({
    id: session.user.id,
    dateOfBirth: parsed.data.dob,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
  });

  return { status: "success" };
}
