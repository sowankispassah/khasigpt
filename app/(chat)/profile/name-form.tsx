"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

type NameFormProps = {
  initialFirstName: string | null;
  initialLastName: string | null;
};

export function NameForm({ initialFirstName, initialLastName }: NameFormProps) {
  const { translate } = useTranslation();
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);
  const { update: updateSession } = useSession();

  useEffect(() => {
    setFirstName(initialFirstName ?? "");
  }, [initialFirstName]);

  useEffect(() => {
    setLastName(initialLastName ?? "");
  }, [initialLastName]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/mobile/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;

      if (!response.ok || body?.ok === false) {
        setStatus({
          message:
            body?.error ??
            translate("profile.name.error", "Unable to update profile."),
          type: "error",
        });
        return;
      }

      await updateSession({
        firstName,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(" "),
      });
      setStatus({
        message: translate(
          "profile.name.success",
          "Profile details updated successfully."
        ),
        type: "success",
      });
    } catch {
      setStatus({
        message: translate(
          "profile.name.error",
          "Unable to update profile."
        ),
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Personal details"
            translationKey="profile.name.title"
          />
        </h2>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Update the name that appears across the product."
            translationKey="profile.name.description"
          />
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="profile-first-name">
            <EditableTranslation
              defaultText="First name"
              translationKey="profile.name.first_label"
            />
          </label>
          <input
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="profile-first-name"
            name="firstName"
            onChange={(event) => setFirstName(event.target.value)}
            required
            type="text"
            value={firstName}
          />
        </div>
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="profile-last-name">
            <EditableTranslation
              defaultText="Last name"
              translationKey="profile.name.last_label"
            />
          </label>
          <input
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="profile-last-name"
            name="lastName"
            onChange={(event) => setLastName(event.target.value)}
            required
            type="text"
            value={lastName}
          />
        </div>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {status?.type === "error" ? (
          <span className="text-destructive">{status.message}</span>
        ) : status?.type === "success" ? (
          <span className="text-emerald-600">{status.message}</span>
        ) : null}
      </div>
      <button
        className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <span>
              <EditableTranslation
                defaultText="Saving..."
                translationKey="profile.name.saving"
              />
            </span>
          </span>
        ) : (
          <EditableTranslation
            defaultText="Save changes"
            translationKey="profile.name.save_button"
          />
        )}
      </button>
    </form>
  );
}
