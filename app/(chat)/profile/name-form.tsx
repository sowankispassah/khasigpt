"use client";

import { useActionState, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  type UpdateProfileNameState,
  updateNameAction,
} from "./actions";

const initialState: UpdateProfileNameState = { status: "idle" };

type NameFormProps = {
  initialFirstName: string | null;
  initialLastName: string | null;
};

export function NameForm({ initialFirstName, initialLastName }: NameFormProps) {
  const { translate } = useTranslation();
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const { update: updateSession } = useSession();

  const [state, formAction, isPending] = useActionState<
    UpdateProfileNameState,
    FormData
  >(async (prev, formData) => {
    const result = await updateNameAction(prev, formData);
    if (result.status === "success") {
      const submittedFirst = formData.get("firstName")?.toString() ?? "";
      const submittedLast = formData.get("lastName")?.toString() ?? "";
      setFirstName(submittedFirst);
      setLastName(submittedLast);
      await updateSession({
        firstName: submittedFirst,
        lastName: submittedLast,
        name: [submittedFirst, submittedLast].filter(Boolean).join(" "),
      });
    }
    return result;
  }, initialState);

  useEffect(() => {
    setFirstName(initialFirstName ?? "");
  }, [initialFirstName]);

  useEffect(() => {
    setLastName(initialLastName ?? "");
  }, [initialLastName]);

  return (
    <form
      action={formAction}
      className="rounded-lg border bg-card p-6 shadow-sm space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {translate("profile.name.title", "Personal details")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {translate(
            "profile.name.description",
            "Update the name that appears across the product."
          )}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="profile-first-name">
            {translate("profile.name.first_label", "First name")}
          </label>
          <input
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="profile-first-name"
            name="firstName"
            required
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="profile-last-name">
            {translate("profile.name.last_label", "Last name")}
          </label>
          <input
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="profile-last-name"
            name="lastName"
            required
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : state.status === "success" ? (
          <span className="text-emerald-600">
            {translate(
              "profile.name.success",
              "Profile details updated successfully."
            )}
          </span>
        ) : null}
      </div>
      <button
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <span>
              {translate("profile.name.saving", "Saving...")}
            </span>
          </span>
        ) : (
          translate("profile.name.save_button", "Save changes")
        )}
      </button>
    </form>
  );
}
