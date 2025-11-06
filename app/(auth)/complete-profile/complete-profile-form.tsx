"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { useTranslation } from "@/components/language-provider";

import {
  submitDateOfBirthAction,
  type CompleteProfileState,
} from "./actions";

const initialState: CompleteProfileState = { status: "idle" };

type CompleteProfileFormProps = {
  defaultDateOfBirth?: string | null;
  defaultFirstName?: string | null;
  defaultLastName?: string | null;
};

export function CompleteProfileForm({
  defaultDateOfBirth = null,
  defaultFirstName = null,
  defaultLastName = null,
}: CompleteProfileFormProps) {
  const { translate } = useTranslation();
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
        <label className="text-sm font-medium" htmlFor="firstName">
          {translate("complete_profile.first_name.label", "First name")}
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={defaultFirstName ?? ""}
          id="firstName"
          name="firstName"
          placeholder={translate(
            "complete_profile.first_name.placeholder",
            "Enter your first name"
          )}
          required
          type="text"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="lastName">
          {translate("complete_profile.last_name.label", "Last name")}
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={defaultLastName ?? ""}
          id="lastName"
          name="lastName"
          placeholder={translate(
            "complete_profile.last_name.placeholder",
            "Enter your last name"
          )}
          required
          type="text"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="dob">
          {translate("complete_profile.dob.label", "Date of birth")}
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id="dob"
          max={maxDate}
          defaultValue={defaultDateOfBirth ?? undefined}
          name="dob"
          required
          type="date"
        />
        <p className="text-muted-foreground text-xs">
          {translate(
            "complete_profile.dob.helper",
            "We use this to verify that you meet the minimum age requirement (13+)."
          )}
        </p>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}
      <SubmitButton isSuccessful={state.status === "success"}>
        {translate("complete_profile.submit", "Save and continue")}
      </SubmitButton>
    </form>
  );
}
