"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { updateNameAction } from "./actions";
import {
  PROFILE_INPUT_CLASS,
  PROFILE_PRIMARY_BUTTON_CLASS,
  ProfileField,
  ProfileFormFooter,
  ProfileStatusText,
} from "./profile-ui";

type NameFormProps = {
  initialFirstName: string | null;
  initialLastName: string | null;
};

export function NameForm({ initialFirstName, initialLastName }: NameFormProps) {
  const router = useRouter();
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
    if (isSaving) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setIsSaving(true);
    setStatus(null);

    try {
      const result = await updateNameAction({ status: "idle" }, formData);
      if (result.status !== "success") {
        setStatus({
          message:
            result.status === "error" && result.reason === "invalid"
              ? translate(
                  "profile.name.invalid",
                  "Enter a first and last name of up to 64 characters each."
                )
              : translate("profile.name.error", "Unable to update profile."),
          type: "error",
        });
        return;
      }

      setFirstName(result.firstName);
      setLastName(result.lastName);
      setStatus({
        message: translate(
          "profile.name.success",
          "Profile details updated successfully."
        ),
        type: "success",
      });
      await updateSession({}).catch((error) => {
        console.error("[profile/name] Failed to refresh session.", error);
      });
      router.refresh();
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
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileField
          htmlFor="profile-first-name"
          label={
            <EditableTranslation
              defaultText="First name"
              translationKey="profile.name.first_label"
            />
          }
        >
          <input
            autoComplete="given-name"
            className={PROFILE_INPUT_CLASS}
            id="profile-first-name"
            maxLength={64}
            name="firstName"
            onChange={(event) => setFirstName(event.target.value)}
            required
            type="text"
            value={firstName}
          />
        </ProfileField>
        <ProfileField
          htmlFor="profile-last-name"
          label={
            <EditableTranslation
              defaultText="Last name"
              translationKey="profile.name.last_label"
            />
          }
        >
          <input
            autoComplete="family-name"
            className={PROFILE_INPUT_CLASS}
            id="profile-last-name"
            maxLength={64}
            name="lastName"
            onChange={(event) => setLastName(event.target.value)}
            required
            type="text"
            value={lastName}
          />
        </ProfileField>
      </div>
      <ProfileFormFooter
        action={
          <button
            className={PROFILE_PRIMARY_BUTTON_CLASS}
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon size={16} />
                </span>
                <span>
                  <EditableTranslation
                    defaultText="Saving..."
                    translationKey="profile.name.saving"
                  />
                </span>
              </>
            ) : (
              <EditableTranslation
                defaultText="Save changes"
                translationKey="profile.name.save_button"
              />
            )}
          </button>
        }
        status={
          status ? (
            <ProfileStatusText type={status.type}>{status.message}</ProfileStatusText>
          ) : null
        }
      />
    </form>
  );
}
