"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type DeleteAccountFormState,
  submitDeleteAccountRequestAction,
} from "./actions";

const initialState: DeleteAccountFormState = { status: "idle" };

type DeleteAccountRequestFormProps = {
  initialValues: {
    fullName: string;
    email: string;
    usernameOrUserId: string;
  };
  isLoggedIn: boolean;
};

const reasonOptions = [
  {
    value: "no_longer_using",
    key: "delete_account.form.reason.no_longer_using",
    fallback: "No longer using the service",
  },
  {
    value: "privacy_concerns",
    key: "delete_account.form.reason.privacy_concerns",
    fallback: "Privacy concerns",
  },
  {
    value: "duplicate_account",
    key: "delete_account.form.reason.duplicate_account",
    fallback: "Created duplicate account",
  },
  {
    value: "prefer_not_to_say",
    key: "delete_account.form.reason.prefer_not_to_say",
    fallback: "Prefer not to say",
  },
  {
    value: "other",
    key: "delete_account.form.reason.other",
    fallback: "Other",
  },
] as const;

export function DeleteAccountRequestForm({
  initialValues,
  isLoggedIn,
}: DeleteAccountRequestFormProps) {
  const [state, formAction] = useActionState<
    DeleteAccountFormState,
    FormData
  >(submitDeleteAccountRequestAction, initialState);
  const { translate } = useTranslation();
  const [values, setValues] = useState({
    ...initialValues,
    reason: "no_longer_using",
    notes: "",
  });

  const usernamePlaceholder = useEditableTranslation(
    "delete_account.form.username.placeholder",
    "Username or account ID"
  );
  const notesPlaceholder = useEditableTranslation(
    "delete_account.form.notes.placeholder",
    "Anything else support should know..."
  );
  const submitPendingLabel = useEditableTranslation(
    "delete_account.form.submit.pending",
    "Submitting..."
  );

  useEffect(() => {
    if (state.status === "error") {
      setValues({
        fullName: state.values.fullName,
        email: state.values.email,
        usernameOrUserId: state.values.usernameOrUserId,
        reason: state.values.reason || "no_longer_using",
        notes: state.values.notes,
      });
    }
  }, [state]);

  const translatedReasons = useMemo(
    () =>
      reasonOptions.map((option) => ({
        ...option,
        label: translate(option.key, option.fallback),
      })),
    [translate]
  );

  if (state.status === "success") {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 shadow-sm"
      >
        <h2 className="font-semibold text-xl">
          <EditableTranslation
            defaultText="Your account deletion request has been received."
            translationKey="delete_account.success.title"
          />
        </h2>
        <p className="mt-3 text-sm">
          <EditableTranslation
            defaultText="Reference ID:"
            translationKey="delete_account.success.reference_prefix"
          />{" "}
          <span className="font-mono font-semibold">{state.referenceId}</span>
        </p>
        <p className="mt-3 text-sm">
          <EditableTranslation
            defaultText="We will review your request and process it according to our data retention policy."
            translationKey="delete_account.success.body"
          />
        </p>
        {state.requiresEmailVerification ? (
          <p className="mt-3 text-sm">
            <EditableTranslation
              defaultText="Before we process the request, verify ownership by opening the confirmation link sent to your email address."
              translationKey="delete_account.success.verify_email"
            />{" "}
            <span className="font-medium">{state.email}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-lg border bg-card p-5 shadow-sm md:p-6"
    >
      <input
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        name="website"
        tabIndex={-1}
        type="text"
      />

      <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
        {isLoggedIn ? (
          <EditableTranslation
            defaultText="You are signed in, so this request will be linked to your account after you confirm the acknowledgements below."
            translationKey="delete_account.form.signed_in_notice"
          />
        ) : (
          <EditableTranslation
            defaultText="You are not signed in. We will send a verification email and will not process the deletion request until you verify ownership of the email address."
            translationKey="delete_account.form.signed_out_notice"
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2" htmlFor="delete-fullName">
          <span className="font-medium text-sm">
            <EditableTranslation
              defaultText="Full Name"
              translationKey="delete_account.form.full_name.label"
            />
          </span>
          <Input
            aria-invalid={
              state.status === "error" && state.errors.fullName
                ? "true"
                : undefined
            }
            className="cursor-text"
            id="delete-fullName"
            maxLength={128}
            name="fullName"
            onChange={(event) =>
              setValues((prev) => ({ ...prev, fullName: event.target.value }))
            }
            required
            value={values.fullName}
          />
          {state.status === "error" && state.errors.fullName ? (
            <span className="text-destructive text-xs">
              {state.errors.fullName}
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2" htmlFor="delete-email">
          <span className="font-medium text-sm">
            <EditableTranslation
              defaultText="Email Address"
              translationKey="delete_account.form.email.label"
            />
          </span>
          <Input
            aria-invalid={
              state.status === "error" && state.errors.email
                ? "true"
                : undefined
            }
            className="cursor-text read-only:bg-muted/40"
            id="delete-email"
            maxLength={128}
            name="email"
            onChange={(event) =>
              setValues((prev) => ({ ...prev, email: event.target.value }))
            }
            readOnly={isLoggedIn}
            required
            type="email"
            value={values.email}
          />
          {state.status === "error" && state.errors.email ? (
            <span className="text-destructive text-xs">
              {state.errors.email}
            </span>
          ) : null}
        </label>
      </div>

      <label className="flex flex-col gap-2" htmlFor="delete-username">
        <span className="font-medium text-sm">
          <EditableTranslation
            defaultText="Username/User ID (optional)"
            translationKey="delete_account.form.username.label"
          />
        </span>
        {usernamePlaceholder.editButton}
        <Input
          aria-invalid={
            state.status === "error" && state.errors.usernameOrUserId
              ? "true"
              : undefined
          }
          className="cursor-text"
          id="delete-username"
          maxLength={128}
          name="usernameOrUserId"
          onChange={(event) =>
            setValues((prev) => ({
              ...prev,
              usernameOrUserId: event.target.value,
            }))
          }
          placeholder={usernamePlaceholder.text}
          value={values.usernameOrUserId}
        />
        {state.status === "error" && state.errors.usernameOrUserId ? (
          <span className="text-destructive text-xs">
            {state.errors.usernameOrUserId}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2" htmlFor="delete-notes">
        <span className="font-medium text-sm">
          <EditableTranslation
            defaultText="Reason for deletion"
            translationKey="delete_account.form.reason.label"
          />
        </span>
        <select
          aria-invalid={
            state.status === "error" && state.errors.reason ? "true" : undefined
          }
          className="h-10 cursor-pointer rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          name="reason"
          onChange={(event) =>
            setValues((prev) => ({ ...prev, reason: event.target.value }))
          }
          required
          value={values.reason}
        >
          {translatedReasons.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {state.status === "error" && state.errors.reason ? (
          <span className="text-destructive text-xs">
            {state.errors.reason}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2" htmlFor="delete-notes">
        <span className="font-medium text-sm">
          <EditableTranslation
            defaultText="Additional comments (optional)"
            translationKey="delete_account.form.notes.label"
          />
        </span>
        {notesPlaceholder.editButton}
        <Textarea
          aria-invalid={
            state.status === "error" && state.errors.notes ? "true" : undefined
          }
          className="min-h-[120px] cursor-text"
          id="delete-notes"
          maxLength={2000}
          name="notes"
          onChange={(event) =>
            setValues((prev) => ({ ...prev, notes: event.target.value }))
          }
          placeholder={notesPlaceholder.text}
          value={values.notes}
        />
        {state.status === "error" && state.errors.notes ? (
          <span className="text-destructive text-xs">{state.errors.notes}</span>
        ) : null}
      </label>

      <div className="space-y-3 rounded-md border border-border p-4">
        <Label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            className="mt-1 cursor-pointer"
            name="permanentAcknowledge"
            required
            type="checkbox"
          />
          <span>
            <EditableTranslation
              defaultText="I understand that account deletion is permanent and cannot be undone."
              translationKey="delete_account.form.ack.permanent"
            />
          </span>
        </Label>
        <Label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            className="mt-1 cursor-pointer"
            name="dataAcknowledge"
            required
            type="checkbox"
          />
          <span>
            <EditableTranslation
              defaultText="I understand that all associated data may be permanently removed."
              translationKey="delete_account.form.ack.data"
            />
          </span>
        </Label>
        {state.status === "error" && state.errors.acknowledgements ? (
          <span className="block text-destructive text-xs">
            {state.errors.acknowledgements}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-[1rem] text-sm">
          {state.status === "error" ? (
            <span className="text-destructive">{state.message}</span>
          ) : null}
        </div>
        <FormSubmitButton pendingLabel={submitPendingLabel.text}>
          <EditableTranslation
            defaultText="Submit deletion request"
            translationKey="delete_account.form.submit.default"
          />
        </FormSubmitButton>
      </div>

      <p className="text-muted-foreground text-xs">
        <EditableTranslation
          defaultText="Questions about deletion or retention can be sent through the contact form."
          translationKey="delete_account.form.support_note"
        />{" "}
        <Link className="cursor-pointer underline" href="/about#contact">
          <EditableTranslation
            defaultText="Contact support"
            translationKey="delete_account.form.support_link"
          />
        </Link>
      </p>
    </form>
  );
}
