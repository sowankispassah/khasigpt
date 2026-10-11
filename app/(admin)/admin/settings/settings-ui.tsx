import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared layout pieces for the admin Settings page. Server-safe: no client
 * state, so the page stays a Server Component and only controls hydrate.
 */

export const SETTINGS_INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const SETTINGS_SELECT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "cursor-pointer px-2.5"
);

export const SETTINGS_TEXTAREA_CLASS =
  "min-h-32 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const SETTINGS_CHECKBOX_CLASS = "size-4 shrink-0 cursor-pointer accent-primary";

export function settingsSectionId(title: string) {
  return `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

/** Collapsible top-level settings group. */
export function SettingsSection({
  children,
  defaultOpen = false,
  description,
  icon: Icon,
  id,
  meta,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description?: ReactNode;
  icon?: LucideIcon;
  id?: string;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <details
      className="group scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-xs"
      id={id ?? settingsSectionId(title)}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition hover:bg-muted/40 sm:px-5 [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-base">{title}</h2>
            {meta}
          </div>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        <ChevronDown
          aria-hidden="true"
          className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="divide-y divide-border/60 border-t">{children}</div>
    </details>
  );
}

/** A block inside a section, separated from its siblings by a divider. */
export function SettingsSubsection({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <section className={cn("px-4 py-5 sm:px-5", className)}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h3 className="font-semibold text-sm">{title}</h3> : null}
            {description ? (
              <p className="mt-0.5 max-w-3xl text-muted-foreground text-xs leading-relaxed">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label, control and help text stacked with consistent spacing. */
export function SettingsField({
  children,
  className,
  help,
  htmlFor,
  label,
}: {
  children: ReactNode;
  className?: string;
  help?: ReactNode;
  htmlFor: string;
  label: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label className="font-medium text-sm" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{help}</p>
      ) : null}
    </div>
  );
}

/** Right-aligned save row at the end of a form; pass a column span for grids. */
export function SettingsFormActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Small uppercase-free group label used inside long lists of controls. */
export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pt-5 pb-1 font-medium text-muted-foreground text-xs sm:px-5">
      {children}
    </p>
  );
}
