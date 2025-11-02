"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";

import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { submitContactFormAction, type ContactFormState } from "./actions";

const initialState: ContactFormState = { status: "idle" };

type FormValues = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

const emptyValues: FormValues = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
};

export function ContactForm() {
  const [state, formAction, isPending] = useActionState<
    ContactFormState,
    FormData
  >(submitContactFormAction, initialState);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const { translate } = useTranslation();

  useEffect(() => {
    if (state.status === "success") {
      setValues(emptyValues);
    } else if (state.status === "error") {
      setValues(state.values);
    }
  }, [state]);

  const handleChange =
    (field: keyof FormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setValues((prev) => ({
        ...prev,
        [field]: nextValue,
      }));
    };

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {translate("contact.form.field.name", "Name")}
          </span>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={values.name}
            onChange={handleChange("name")}
            name="name"
            placeholder={translate("contact.form.placeholder.name", "Your name")}
            required
            type="text"
          />
          {state.status === "error" && state.errors?.name ? (
            <span className="text-destructive text-xs">
              {state.errors.name}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {translate("contact.form.field.email", "Email")}
          </span>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={values.email}
            onChange={handleChange("email")}
            name="email"
            placeholder={translate("contact.form.placeholder.email", "you@example.com")}
            required
            type="email"
          />
          {state.status === "error" && state.errors?.email ? (
            <span className="text-destructive text-xs">
              {state.errors.email}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-sm font-medium">
            {translate("contact.form.field.phone", "Phone (optional)")}
          </span>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={values.phone}
            onChange={handleChange("phone")}
            name="phone"
            placeholder={translate("contact.form.placeholder.phone", "+91 98765 43210")}
            type="tel"
          />
          {state.status === "error" && state.errors?.phone ? (
            <span className="text-destructive text-xs">
              {state.errors.phone}
            </span>
          ) : null}
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {translate("contact.form.field.subject", "Subject")}
        </span>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={values.subject}
          onChange={handleChange("subject")}
          name="subject"
          placeholder={translate("contact.form.placeholder.subject", "How can we help?")}
          required
          type="text"
        />
        {state.status === "error" && state.errors?.subject ? (
          <span className="text-destructive text-xs">
            {state.errors.subject}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {translate("contact.form.field.message", "Message")}
        </span>
        <textarea
          className="min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={values.message}
          onChange={handleChange("message")}
          name="message"
          placeholder={translate(
            "contact.form.placeholder.message",
            "Share a few details about your request..."
          )}
          required
        />
        {state.status === "error" && state.errors?.message ? (
          <span className="text-destructive text-xs">
            {state.errors.message}
          </span>
        ) : null}
      </label>
      <div className="flex flex-col gap-2">
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>
                {translate("contact.form.submit.sending", "Sending...")}
              </span>
            </span>
          ) : (
            translate("contact.form.submit.default", "Send message")
          )}
        </button>
        <div
          aria-live="polite"
          className="min-h-[1rem] text-sm text-muted-foreground"
        >
          {state.status === "error" ? (
            <span className="text-destructive">
              {state.message && state.message.trim().length > 0
                ? state.message
                : translate(
                    "contact.form.submit.error_generic",
                    "Please review the highlighted fields."
                  )}
            </span>
          ) : state.status === "success" ? (
            <span className="text-emerald-500">
              {translate(
                "contact.form.submit.success",
                "Thanks! We'll reach out soon."
              )}
            </span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
