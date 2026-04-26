"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";

export function PasswordForm() {
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
          password,
          confirmPassword,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;

      if (!response.ok || body?.ok === false) {
        setStatus({
          message:
            body?.error ??
            translate(
              "profile.password.error",
              "Unable to update password."
            ),
          type: "error",
        });
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setStatus({
        message: translate(
          "profile.password.success",
          "Password updated successfully."
        ),
        type: "success",
      });
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
          {translate("profile.password.title", "Update password")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {translate(
            "profile.password.description",
            "Password must be at least 8 characters long."
          )}
        </p>
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="profile-password">
          {translate("profile.password.new_label", "New password")}
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password"
          minLength={8}
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
          {translate("profile.password.confirm_label", "Confirm password")}
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password-confirm"
          minLength={8}
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
            <span>{translate("profile.password.saving", "Saving...")}</span>
          </span>
        ) : (
          translate("profile.password.save_button", "Save password")
        )}
      </button>
    </form>
  );
}
