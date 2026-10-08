"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Visual building blocks for the account menu. They mirror the native app's
 * user-menu parts (native/src/components/user-menu/UserMenuParts.tsx) so both
 * platforms share one layout: identity header, plan card, 40-44px icon rows,
 * inline sub-lists, switch rows and a separated destructive row.
 */

const ROW_CLASS =
  "min-h-11 gap-3 rounded-[10px] px-3 py-2 text-sm sm:min-h-10 [&_svg]:size-[18px]";
/** Sub-items line up with the row label, past the leading icon. */
const SUB_ITEM_CLASS =
  "min-h-10 gap-2 rounded-[10px] py-2 pr-3 pl-[42px] text-sm sm:min-h-9";

export function UserMenuDivider() {
  return <DropdownMenuSeparator className="mx-3 my-1" />;
}

export function UserMenuIdentity({
  avatarColor,
  avatarSrc,
  email,
  href,
  initials,
  name,
  nameTestId,
}: {
  avatarColor: string;
  avatarSrc: string | null;
  email: string | null;
  href: string;
  initials: string;
  name: string;
  nameTestId?: string;
}) {
  const showEmail = Boolean(email && email !== name);
  return (
    <DropdownMenuItem asChild className="min-h-[60px] gap-3 rounded-xl px-3 py-2">
      <Link href={href}>
        <Avatar className="size-10 shrink-0">
          <AvatarImage
            alt={name}
            className="object-cover"
            src={avatarSrc ?? undefined}
          />
          <AvatarFallback
            className="font-bold text-base text-white uppercase"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-[15px]" data-testid={nameTestId}>
            {name}
          </span>
          {showEmail ? (
            <span className="truncate text-muted-foreground text-xs">{email}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden="true" className="size-4! text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  );
}

export function UserMenuPlanCard({
  action,
  credits,
  href,
  icon: Icon,
  isLoading,
  planLabel,
  testId,
  title,
}: {
  /** Primary action rendered under the plan, e.g. Upgrade plan. */
  action: ReactNode;
  /** Remaining/total credits, shown with a meter once the balance is known. */
  credits: { percent: number; remaining: string; summary: ReactNode } | null;
  href: string;
  icon: LucideIcon;
  isLoading: boolean;
  planLabel: string;
  testId?: string;
  title: ReactNode;
}) {
  const tone =
    credits === null
      ? "bg-muted-foreground"
      : credits.percent <= 5
        ? "bg-rose-500"
        : credits.percent <= 20
          ? "bg-amber-500"
          : "bg-emerald-500";
  const width = credits ? Math.max(0, Math.min(100, credits.percent)) : 0;
  return (
    <div className="mx-1 my-1 flex flex-col gap-3 rounded-xl bg-muted p-3">
      <DropdownMenuItem
        asChild
        className="-m-1 min-h-11 gap-3 rounded-[10px] p-1 focus:bg-background/60 sm:min-h-10"
        data-testid={testId}
      >
        <Link href={href}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-background">
            <Icon aria-hidden="true" className="size-4! text-foreground" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-sm">{title}</span>
            <span className="truncate text-muted-foreground text-xs">{planLabel}</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4! text-muted-foreground" />
        </Link>
      </DropdownMenuItem>
      {credits ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline gap-1">
            <span className="font-bold text-base tabular-nums">{credits.remaining}</span>
            <span className="text-muted-foreground text-xs">{credits.summary}</span>
          </p>
          <div
            aria-label={`${Math.round(width)}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(width)}
            className="h-1.5 w-full overflow-hidden rounded-full bg-background"
            role="progressbar"
          >
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
          </div>
        </div>
      ) : isLoading ? (
        <div aria-hidden="true" className="flex flex-col gap-1.5">
          <span className="h-4 w-32 animate-pulse rounded bg-background/80" />
          <span className="h-1.5 w-full animate-pulse rounded-full bg-background/80" />
        </div>
      ) : null}
      {action}
    </div>
  );
}

export function UserMenuPrimaryAction({
  href,
  icon: Icon,
  label,
  testId,
}: {
  href: string;
  icon: LucideIcon;
  label: ReactNode;
  testId?: string;
}) {
  return (
    <DropdownMenuItem
      asChild
      className="min-h-10 justify-center gap-2 rounded-[10px] bg-primary px-3 font-medium text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground"
      data-testid={testId}
    >
      <Link href={href}>
        <Icon aria-hidden="true" className="size-4!" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

type RowProps = Omit<ComponentPropsWithoutRef<typeof DropdownMenuItem>, "children"> & {
  destructive?: boolean;
  /** Set for rows that expand an inline sub-list. */
  expanded?: boolean;
  href?: string;
  icon: LucideIcon;
  label: ReactNode;
  /** Renders a read-only switch showing the current state. */
  switchValue?: boolean;
  trailingIcon?: LucideIcon;
  value?: string | null;
};

export function UserMenuRow({
  className,
  destructive = false,
  expanded,
  href,
  icon: Icon,
  label,
  switchValue,
  trailingIcon: TrailingIcon,
  value,
  ...props
}: RowProps) {
  const isSwitch = switchValue !== undefined;
  const isExpandable = expanded !== undefined;
  const body = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          destructive ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value ? (
        <span className="max-w-[110px] shrink truncate text-muted-foreground text-xs">
          {value}
        </span>
      ) : null}
      {isSwitch ? (
        <UserMenuSwitch checked={switchValue} />
      ) : isExpandable ? (
        expanded ? (
          <ChevronDown aria-hidden="true" className="size-4! text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-4! text-muted-foreground" />
        )
      ) : TrailingIcon ? (
        <TrailingIcon aria-hidden="true" className="size-4! text-muted-foreground" />
      ) : null}
    </>
  );
  const rowClass = cn(
    ROW_CLASS,
    destructive &&
      "text-rose-700 focus:bg-rose-500/10 focus:text-rose-700 dark:text-rose-400 dark:focus:text-rose-400",
    className
  );
  if (href) {
    return (
      <DropdownMenuItem asChild className={rowClass} {...props}>
        <Link href={href}>{body}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      aria-expanded={isExpandable ? expanded : undefined}
      className={rowClass}
      // Only switch rows change role; passing undefined would drop Radix's
      // default "menuitem" role.
      {...(isSwitch
        ? { "aria-checked": switchValue, role: "menuitemcheckbox" as const }
        : {})}
      {...props}
    >
      {body}
    </DropdownMenuItem>
  );
}

type SubItemProps = Omit<ComponentPropsWithoutRef<typeof DropdownMenuItem>, "children"> & {
  href?: string;
  label: ReactNode;
  pending?: boolean;
  selected?: boolean;
};

export function UserMenuSubItem({
  className,
  href,
  label,
  pending = false,
  selected = false,
  ...props
}: SubItemProps) {
  const body = (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          selected ? "font-semibold text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {pending ? (
        <Loader2 aria-hidden="true" className="size-4! animate-spin text-muted-foreground" />
      ) : selected ? (
        <Check aria-hidden="true" className="size-4! text-foreground" />
      ) : null}
    </>
  );
  if (href) {
    return (
      <DropdownMenuItem asChild className={cn(SUB_ITEM_CLASS, className)} {...props}>
        <Link href={href}>{body}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className={cn(SUB_ITEM_CLASS, className)} {...props}>
      {body}
    </DropdownMenuItem>
  );
}

/** Visual switch inside a menu row; the row itself carries aria-checked. */
export function UserMenuSwitch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[22px] w-[38px] shrink-0 items-center rounded-full px-[3px] transition-colors",
        checked ? "justify-end bg-primary" : "justify-start bg-input"
      )}
    >
      <span
        className={cn(
          "size-4 rounded-full shadow-sm transition-colors",
          checked ? "bg-primary-foreground" : "bg-background"
        )}
      />
    </span>
  );
}
