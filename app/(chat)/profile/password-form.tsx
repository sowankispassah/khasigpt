"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

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
    <form
      className="space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Update password"
            translationKey="profile.password.title"
          />
        </h2>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Password must be at least 8 characters long."
            translationKey="profile.password.description"
          />
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        <EditableTranslation translationKey="profile.password.security_notice" defaultText="Changing your password signs out every device. If you use Google or forgot your current password, use Forgot password to set a new one." />
      </p>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="profile-current-password">
          <EditableTranslation translationKey="profile.password.current_label" defaultText="Current password" />
        </label>
        <input id="profile-current-password" name="currentPassword" autoComplete="current-password" type="password" required
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => setCurrentPassword(event.target.value)} value={currentPassword} />
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="profile-password">
          <EditableTranslation
            defaultText="New password"
            translationKey="profile.password.new_label"
          />
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password"
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <div className="space-y-2">
        <label
          className="font-medium text-sm"
          htmlFor="profile-password-confirm"
        >
          <EditableTranslation
            defaultText="Confirm password"
            translationKey="profile.password.confirm_label"
          />
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password-confirm"
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
        <div aria-live="polite" className="min-h-[1.25rem] text-sm">
          {status?.type === "error" ? (
            <span className="text-destructive">{status.message}</span>
          ) : status?.type === "success" ? (
            <span className="text-emerald-600">{status.message}</span>
          ) : null}
        </div>
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
                translationKey="profile.password.saving"
              />
            </span>
          </span>
        ) : (
          <EditableTranslation
            defaultText="Save password"
            translationKey="profile.password.save_button"
          />
        )}
      </button>
    </form>
  );
}
