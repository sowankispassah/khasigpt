"use client";

import {
  type ChangeEvent,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { type ContactFormState, submitContactFormAction } from "./actions";

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

type ContactFormProps = {
  translations?: Record<string, string>;
};

export function ContactForm({ translations = {} }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState<
    ContactFormState,
    FormData
  >(submitContactFormAction, initialState);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const { translate: runtimeTranslate } = useTranslation();
  const translate = useCallback(
    (key: string, fallback: string) =>
      translations[key] ?? runtimeTranslate(key, fallback),
    [runtimeTranslate, translations]
  );
  const namePlaceholder = useEditableTranslation(
    "contact.form.placeholder.name",
    "Your name"
  );
  const emailPlaceholder = useEditableTranslation(
    "contact.form.placeholder.email",
    "you@example.com"
  );
  const phonePlaceholder = useEditableTranslation(
    "contact.form.placeholder.phone",
    "+91 98765 43210"
  );
  const subjectPlaceholder = useEditableTranslation(
    "contact.form.placeholder.subject",
    "How can we help?"
  );
  const messagePlaceholder = useEditableTranslation(
    "contact.form.placeholder.message",
    "Share a few details about your request..."
  );

  useEffect(() => {
    if (state.status === "success") {
      setValues(emptyValues);
      setSelectedFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } else if (state.status === "error") {
      setValues(state.values);
    }
  }, [state]);

  const handleChange =
    (field: keyof FormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
          <span className="font-medium text-sm">
            <EditableTranslation
              defaultText="Name"
              translationKey="contact.form.field.name"
            />
          </span>
          {namePlaceholder.editButton}
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            name="name"
            onChange={handleChange("name")}
            placeholder={namePlaceholder.text}
            required
            type="text"
            value={values.name}
          />
          {state.status === "error" && state.errors?.name ? (
            <span className="text-destructive text-xs">
              {state.errors.name}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium text-sm">
            <EditableTranslation
              defaultText="Email"
              translationKey="contact.form.field.email"
            />
          </span>
          {emailPlaceholder.editButton}
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            name="email"
            onChange={handleChange("email")}
            placeholder={emailPlaceholder.text}
            required
            type="email"
            value={values.email}
          />
          {state.status === "error" && state.errors?.email ? (
            <span className="text-destructive text-xs">
              {state.errors.email}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="font-medium text-sm">
            <EditableTranslation
              defaultText="Phone (optional)"
              translationKey="contact.form.field.phone"
            />
          </span>
          {phonePlaceholder.editButton}
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            name="phone"
            onChange={handleChange("phone")}
            placeholder={phonePlaceholder.text}
            type="tel"
            value={values.phone}
          />
          {state.status === "error" && state.errors?.phone ? (
            <span className="text-destructive text-xs">
              {state.errors.phone}
            </span>
          ) : null}
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="font-medium text-sm">
          <EditableTranslation
            defaultText="Subject"
            translationKey="contact.form.field.subject"
          />
        </span>
        {subjectPlaceholder.editButton}
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          name="subject"
          onChange={handleChange("subject")}
          placeholder={subjectPlaceholder.text}
          required
          type="text"
          value={values.subject}
        />
        {state.status === "error" && state.errors?.subject ? (
          <span className="text-destructive text-xs">
            {state.errors.subject}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-medium text-sm">
          <EditableTranslation
            defaultText="Message"
            translationKey="contact.form.field.message"
          />
        </span>
        {messagePlaceholder.editButton}
        <textarea
          className="min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          name="message"
          onChange={handleChange("message")}
          placeholder={messagePlaceholder.text}
          required
          value={values.message}
        />
        {state.status === "error" && state.errors?.message ? (
          <span className="text-destructive text-xs">
            {state.errors.message}
          </span>
        ) : null}
      </label>
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="contact-attachments">
          <EditableTranslation defaultText="Attachments (optional)" description="Contact form file picker label." translationKey="contact.form.attachments.label" />
        </label>
        <input
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx"
          className="w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-3 file:py-1"
          id="contact-attachments"
          multiple
          name="attachments"
          onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? [], (file) => file.name))}
          ref={fileInput}
          type="file"
        />
        <p className="text-muted-foreground text-xs"><EditableTranslation defaultText="Up to 3 files, 3 MB total. PDF, images, text, or DOCX." description="Contact attachment size and format guidance." translationKey="contact.form.attachments.help" /></p>
        {selectedFiles.length ? <ul className="list-inside list-disc text-xs">{selectedFiles.map((name, index) => <li className="break-all" key={`${index}-${name}`}>{name}</li>)}</ul> : null}
        {state.status === "error" && state.attachmentError ? <p className="text-destructive text-xs" role="alert">{translate(`contact.form.attachments.error.${state.attachmentError}`, state.attachmentError === "too_many" ? "Select up to 3 files." : state.attachmentError === "too_large" ? "Attachments must be 3 MB or smaller in total." : state.attachmentError === "invalid_type" ? "Choose PDF, image, text, or DOCX files." : "Could not upload the attachment. Please try again.")}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>
                <EditableTranslation
                  defaultText="Sending..."
                  translationKey="contact.form.submit.sending"
                />
              </span>
            </span>
          ) : (
            <EditableTranslation
              defaultText="Send message"
              translationKey="contact.form.submit.default"
            />
          )}
        </button>
        <div
          aria-live="polite"
          className="min-h-[1rem] text-muted-foreground text-sm"
        >
          {state.status === "error" ? (
            <span className="text-destructive">
              {state.errorCode === "rate_limited"
                ? translate("contact.form.submit.rate_limited", "Too many contact requests. Please try again later.")
                : state.message && state.message.trim().length > 0
                ? state.message
                : translate(
                    "contact.form.submit.error_generic",
                    "Please review the highlighted fields."
                  )}
            </span>
          ) : state.status === "success" ? (
            <span className="text-emerald-500">
              <EditableTranslation
                defaultText="Thanks! We'll reach out soon."
                translationKey="contact.form.submit.success"
              />
            </span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
