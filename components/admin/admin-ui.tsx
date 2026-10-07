import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { findAdminNavEntry } from "@/lib/admin/navigation";
import { cn } from "@/lib/utils";

/**
 * Shared admin building blocks. Server-safe (no client state), so pages keep
 * rendering on the server and only interactive pieces become client islands.
 */

export function AdminPageHeader({
  actions,
  description,
  icon,
  meta,
  navHref,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  /** Explicit icon; defaults to the icon of the nav entry for `navHref`. */
  icon?: LucideIcon;
  meta?: ReactNode;
  navHref?: string;
  title: ReactNode;
}) {
  const Icon = icon ?? (navHref ? findAdminNavEntry(navHref)?.item.icon : undefined);

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function AdminStatCard({
  hint,
  href,
  icon: Icon,
  label,
  trend,
  value,
}: {
  hint?: ReactNode;
  href?: string;
  icon?: LucideIcon;
  label: ReactNode;
  /** Signed change for the trend chip; omitted when unknown. */
  trend?: { label: ReactNode; value: number } | null;
  /** null means the value could not be confirmed; never shown as zero. */
  value: ReactNode | null;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-muted-foreground text-sm">{label}</p>
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:text-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight sm:text-3xl">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-2 text-muted-foreground text-xs">
        {value !== null && trend ? <AdminTrendChip label={trend.label} value={trend.value} /> : null}
        {value === null ? (
          <EditableTranslation
            defaultText="Unavailable right now"
            description="Shown on an admin metric card when its value could not be confirmed from the database."
            translationKey="admin.stat.unavailable"
          />
        ) : (
          hint
        )}
      </div>
    </>
  );

  const className =
    "group min-w-0 rounded-xl border bg-card p-4 shadow-xs transition sm:p-5";
  return href ? (
    <Link
      className={cn(className, "cursor-pointer hover:border-primary/40 hover:shadow-sm")}
      href={href}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function AdminTrendChip({ label, value }: { label: ReactNode; value: number }) {
  const positive = value > 0;
  const flat = value === 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
        flat
          ? "bg-muted text-muted-foreground"
          : positive
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
      )}
    >
      {flat ? null : <Icon className="size-3" />}
      {positive ? "+" : ""}
      {value.toLocaleString("en-IN")} {label}
    </span>
  );
}

export function AdminPanel({
  action,
  bodyClassName,
  children,
  className,
  description,
  id,
  title,
}: {
  action?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  id?: string;
  title: ReactNode;
}) {
  return (
    <section
      className={cn("flex flex-col rounded-xl border bg-card shadow-xs", className)}
      id={id}
    >
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-base">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

const STATUS_TONES = {
  danger: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-400",
  info: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
  neutral: "bg-muted text-muted-foreground ring-border",
  success:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  warning:
    "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
} as const;

export type AdminStatusTone = keyof typeof STATUS_TONES;

/** Status label with colours that stay readable in light and dark themes. */
export function AdminStatusPill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: AdminStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset",
        STATUS_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function AdminEmptyState({
  description,
  icon: Icon = Inbox,
  title,
}: {
  description?: ReactNode;
  icon?: LucideIcon;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="font-medium text-sm">{title}</p>
      {description ? (
        <p className="max-w-sm text-muted-foreground text-xs">{description}</p>
      ) : null}
    </div>
  );
}
