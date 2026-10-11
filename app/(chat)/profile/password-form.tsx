"use client";

import { ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  PROFILE_INPUT_CLASS,
  PROFILE_PRIMARY_BUTTON_CLASS,
  ProfileField,
  ProfileFormFooter,
  ProfileStatusText,
} from "./profile-ui";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);
  const { translate } = useTranslation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          password,
          confirmPassword,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string; ok?: boolean }
        | null;

      if (!response.ok || body?.ok === false) {
        setStatus({
          message:
            translate(`profile.password.${body?.code ?? "error"}`, body?.error ?? "Unable to update password."),
          type: "error",
        });
        return;
      }

      setPassword("");
      setCurrentPassword("");
      setConfirmPassword("");
      setStatus({
        message: translate(
          "profile.password.success_signin",
          "Password updated. All sessions have been signed out. Sign in again."
        ),
        type: "success",
      });
      await signOut({ callbackUrl: "/login?status=password-updated" });
    } catch {
      setStatus({
        message: translate(
          "profile.password.error",
          "Unable to update password."
        ),
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-muted-foreground text-sm">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <EditableTranslation translationKey="profile.password.security_notice" defaultText="Changing your password signs out every device. If you use Google or forgot your current password, use Forgot password to set a new one." />
        </span>
      </p>
      <ProfileField
        htmlFor="profile-current-password"
        label={
          <EditableTranslation translationKey="profile.password.current_label" defaultText="Current password" />
        }
      >
        <input
          autoComplete="current-password"
          className={PROFILE_INPUT_CLASS}
          id="profile-current-password"
          name="currentPassword"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
      </ProfileField>
      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileField
          htmlFor="profile-password"
          label={
            <EditableTranslation
              defaultText="New password"
              translationKey="profile.password.new_label"
            />
          }
        >
          <input
            autoComplete="new-password"
            className={PROFILE_INPUT_CLASS}
            id="profile-password"
            maxLength={72}
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </ProfileField>
        <ProfileField
          htmlFor="profile-password-confirm"
          label={
            <EditableTranslation
              defaultText="Confirm password"
              translationKey="profile.password.confirm_label"
            />
          }
        >
          <input
            autoComplete="new-password"
            className={PROFILE_INPUT_CLASS}
            id="profile-password-confirm"
            maxLength={72}
            minLength={8}
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
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
                    translationKey="profile.password.saving"
                  />
                </span>
              </>
            ) : (
              <EditableTranslation
                defaultText="Save password"
                translationKey="profile.password.save_button"
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
