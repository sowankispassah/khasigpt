"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";

import {
  submitDateOfBirthAction,
  type CompleteProfileState,
} from "./actions";

const initialState: CompleteProfileState = { status: "idle" };

export function CompleteProfileForm() {
  const [state, formAction] = useActionState(
    submitDateOfBirthAction,
    initialState
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/");
    }
  }, [state.status, router]);

  const maxDate = useMemo(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="dob">
          Date of birth
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="dob"
          max={maxDate}
          name="dob"
          required
          type="date"
        />
        <p className="text-muted-foreground text-xs">
          We use this to verify that you meet the minimum age requirement (13+).
        </p>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}
      <SubmitButton isSuccessful={state.status === "success"}>
        Save and continue
      </SubmitButton>
    </form>
  );
}
