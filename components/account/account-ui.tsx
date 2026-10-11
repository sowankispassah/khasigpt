import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for signed-in customer pages (profile, recharge,
 * subscriptions). Server-safe: no client state, so pages stay Server
 * Components and only interactive pieces become client islands.
 */

export function AccountPageShell({
  actions,
  back,
  children,
  className,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  /** Usually a BackToHomeButton. */
  back?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:py-10",
        className
      )}
    >
      {back ? <div>{back}</div> : null}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1.5 font-medium text-muted-foreground text-sm">{eyebrow}</p>
          ) : null}
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function AccountSection({
  action,
  bodyClassName,
  children,
  className,
  description,
  icon: Icon,
  id,
  title,
  tone = "default",
}: {
  action?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  id?: string;
  title: ReactNode;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <section
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-xs",
        danger && "border-rose-500/30",
        className
      )}
      id={id}
    >
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                danger
                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                  : "bg-muted text-foreground"
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2
              className={cn(
                "font-semibold text-base",
                danger && "text-rose-700 dark:text-rose-400"
              )}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AccountStat({
  className,
  hint,
  icon: Icon,
  label,
  value,
}: {
  className?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  label: ReactNode;
  /** null means the value could not be confirmed; never shown as zero. */
  value: ReactNode | null;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-card p-4 shadow-xs sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-muted-foreground text-sm">{label}</p>
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
      {hint ? <div className="mt-1.5 text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

const METER_TONES = {
  danger: "bg-rose-500",
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
} as const;

/** Horizontal progress bar; `value` is clamped to 0-100. */
export function AccountMeter({
  className,
  label,
  tone = "default",
  value,
}: {
  className?: string;
  /** Accessible description, e.g. "62% of credits left". */
  label: string;
  tone?: keyof typeof METER_TONES;
  value: number;
}) {
  const width = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(width)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
    >
      <div
        className={cn("h-full rounded-full transition-[width]", METER_TONES[tone])}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

const NOTICE_TONES = {
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
} as const;

/** Inline banner; tinted so it reads in both themes. */
export function AccountNotice({
  children,
  className,
  title,
  tone = "warning",
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  tone?: keyof typeof NOTICE_TONES;
}) {
  return (
    <div
      className={cn("rounded-xl border px-4 py-3 text-sm", NOTICE_TONES[tone], className)}
      role={tone === "danger" ? "alert" : undefined}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}
