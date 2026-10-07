import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared input styling for every profile form. */
export const PROFILE_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const PROFILE_PRIMARY_BUTTON_CLASS =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60";

export function ProfileField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-medium text-sm" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Status text on the left, primary action on the right; stacks on phones. */
export function ProfileFormFooter({
  action,
  status,
}: {
  action: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div aria-live="polite" className="min-h-5 text-sm">
        {status}
      </div>
      <div className="flex shrink-0 justify-end">{action}</div>
    </div>
  );
}

export function ProfileStatusText({
  children,
  type,
}: {
  children: ReactNode;
  type: "error" | "success" | "info";
}) {
  return (
    <span
      className={cn(
        type === "error" && "text-destructive",
        type === "success" && "text-emerald-700 dark:text-emerald-400",
        type === "info" && "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

const PILL_TONES = {
  danger: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-400",
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
} as const;

export function ProfilePill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof PILL_TONES;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset",
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Fixed zone so server and browser render identical text. */
export const profileDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const profileDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export function formatProfileDateTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${profileDateTimeFormatter.format(date)} IST`;
}
