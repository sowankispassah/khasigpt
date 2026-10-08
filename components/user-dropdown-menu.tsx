"use client";

import {
  BookOpen,
  CreditCard,
  EllipsisVertical,
  ExternalLink,
  Languages,
  LogOut,
  MessagesSquare,
  Moon,
  PenLine,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  Wallet,
} from "lucide-react";
import React from "react";
import useSWR from "swr";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useTranslationEdit,
} from "@/components/translation-edit-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserMenuDivider,
  UserMenuIdentity,
  UserMenuPlanCard,
  UserMenuPrimaryAction,
  UserMenuRow,
  UserMenuSubItem,
} from "@/components/user-menu/user-menu-parts";
import { cn, fetcher } from "@/lib/utils";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  isCreator?: boolean;
  isAuthenticated: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onLanguageChange?: (code: string) => void;
  languageOptions?: Array<{
    code: string;
    name: string;
    isActive: boolean;
  }>;
  activeLanguageCode?: string | null;
  isLanguageUpdating?: boolean;
  onSignOut?: () => void;
  onActionStart?: () => void;
  onMenuClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  isBusy?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  userDisplayName?: string;
  userEmail?: string;
  /** Avatar version, so the menu header shows the same image as the trigger. */
  userImageVersion?: string | null;
  currentPathname?: string | null;
  forumEnabled?: boolean;
};

const AVATAR_COLORS = [
  "#10B981",
];
const NON_ALPHA_REGEX = /[^a-zA-Z\s]/g;
const WHITESPACE_SPLIT_REGEX = /\s+/;
const PLAN_LOAD_DELAY_MS = 750;

export function getInitials(name?: string | null, email?: string | null) {
  const source = name ?? email ?? "";
  if (!source) {
    return "U";
  }

  const parts = source
    .replace(NON_ALPHA_REGEX, " ")
    .split(WHITESPACE_SPLIT_REGEX)
    .filter(Boolean);

  if (parts.length === 0 && email) {
    return email.slice(0, 1).toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return parts[0][0].toUpperCase();
}

export function getAvatarColor(_key?: string | null) {
  return AVATAR_COLORS[0];
}

type BasicUser = {
  name?: string | null;
  email?: string | null;
  imageVersion?: string | null;
};

/**
 * Current avatar image. Shared by the trigger and the menu header; SWR
 * dedupes the request because both use the same key.
 */
function useUserAvatarSrc(
  imageVersion: string | null | undefined,
  shouldFetch: boolean
) {
  const [avatarOverride, setAvatarOverride] = React.useState<string | null>(
    null
  );
  const [versionOverride, setVersionOverride] = React.useState<
    string | null
  >(null);
  const avatarKey = shouldFetch
    ? `/api/profile/avatar?v=${encodeURIComponent(
        versionOverride ?? imageVersion ?? "none"
      )}`
    : null;

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        image: string | null;
        version?: string | null;
      }>;
      setAvatarOverride(custom.detail?.image ?? null);
      if (custom.detail?.version) {
        setVersionOverride(custom.detail.version);
      }
    };
    window.addEventListener("user-avatar-updated", handler);
    return () => window.removeEventListener("user-avatar-updated", handler);
  }, []);

  const { data } = useSWR<{ image: string | null }>(avatarKey, fetcher, {
    revalidateOnFocus: false,
  });
  return avatarOverride ?? data?.image ?? null;
}

type UserMenuTriggerProps = React.ComponentPropsWithoutRef<"button"> & {
  user: BasicUser;
  isBusy?: boolean;
  shouldFetchAvatar?: boolean;
};

export const UserMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  UserMenuTriggerProps
>(({ user, className, isBusy = false, shouldFetchAvatar = true, ...props }, ref) => {
  const initials = getInitials(user.name, user.email);
  const avatarColor = getAvatarColor(user.email ?? user.name ?? undefined);
  const avatarSrc = useUserAvatarSrc(user.imageVersion, shouldFetchAvatar);

  return (
    <button
      aria-busy={isBusy}
      className={cn(
        "relative flex h-8 min-w-[3.875rem] cursor-pointer items-center justify-between gap-1 rounded-full border border-border bg-muted/40 py-0.5 pr-0.5 pl-1 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      ref={ref}
      type="button"
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-5 items-center justify-center text-muted-foreground"
      >
        <EllipsisVertical size={16} />
      </span>
      <Avatar className="h-8 w-8">
        <AvatarImage
          alt={user.name ?? user.email ?? "User avatar"}
          className="object-cover"
          src={avatarSrc ?? undefined}
        />
        <AvatarFallback
          className="font-semibold text-white text-xs uppercase"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="sr-only">Open user menu</span>
    </button>
  );
});

UserMenuTrigger.displayName = "UserMenuTrigger";

type PlanSnapshot = {
  label: string | null;
  credits: { remaining: number; total: number } | null;
};

const INFO_LINKS = [
  {
    labelKey: "user_menu.resources.about",
    defaultLabel: "About Us",
    path: "/about",
    testId: "user-nav-item-about",
  },
  {
    labelKey: "user_menu.resources.contact",
    defaultLabel: "Contact Us",
    path: "/about#contact",
    testId: "user-nav-item-contact",
  },
  {
    labelKey: "user_menu.resources.privacy",
    defaultLabel: "Privacy Policy",
    path: "/privacy-policy",
    testId: "user-nav-item-privacy",
  },
  {
    labelKey: "user_menu.resources.terms",
    defaultLabel: "Terms of Service",
    path: "/terms-of-service",
    testId: "user-nav-item-terms",
  },
  {
    labelKey: "user_menu.resources.refund",
    defaultLabel: "Refund Policy",
    path: "/refund-policy",
    testId: "user-nav-item-refund",
  },
];

const creditFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

export function UserDropdownMenu({
  trigger,
  isAdmin,
  isCreator = false,
  isAuthenticated,
  resolvedTheme,
  onToggleTheme,
  onLanguageChange,
  languageOptions = [],
  activeLanguageCode,
  isLanguageUpdating = false,
  onSignOut,
  onActionStart,
  onMenuClose,
  onOpenChange,
  isBusy = false,
  side = "top",
  align = "end",
  userDisplayName,
  userEmail,
  userImageVersion = null,
  currentPathname,
  forumEnabled = true,
}: UserDropdownMenuProps) {
  const [plan, setPlan] = React.useState<PlanSnapshot | null>(null);
  const [planStatus, setPlanStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [isLanguageOpen, setIsLanguageOpen] = React.useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [hasOpenedMenu, setHasOpenedMenu] = React.useState(false);
  const dropdownTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const planRequestAbortRef = React.useRef<AbortController | null>(null);
  const planLoadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const planLoadTriggeredRef = React.useRef(false);
  const { translate } = useTranslation();
  const {
    enabled: translationEditEnabled,
    isAdmin: canEditTranslations,
    toggleEnabled: toggleTranslationEdit,
  } = useTranslationEdit();
  const avatarSrc = useUserAvatarSrc(
    userImageVersion,
    isAuthenticated && hasOpenedMenu
  );

  const closeMenuImmediately = React.useCallback(() => {
    setIsMenuOpen(false);
    onOpenChange?.(false);
    onMenuClose?.();
    setIsLanguageOpen(false);
    setIsResourcesOpen(false);
  }, [onMenuClose, onOpenChange]);

  const resetPlanState = React.useCallback(() => {
    if (planLoadTimerRef.current) {
      clearTimeout(planLoadTimerRef.current);
      planLoadTimerRef.current = null;
    }
    planRequestAbortRef.current?.abort();
    planRequestAbortRef.current = null;
    planLoadTriggeredRef.current = false;
    setPlan(null);
    setPlanStatus("idle");
  }, []);

  const cancelPendingPlanLoad = React.useCallback(() => {
    if (!planLoadTimerRef.current) {
      return;
    }
    clearTimeout(planLoadTimerRef.current);
    planLoadTimerRef.current = null;
    planLoadTriggeredRef.current = false;
    setPlanStatus((current) => (current === "loading" ? "idle" : current));
  }, []);

  React.useEffect(() => {
    if (!isMenuOpen) {
      cancelPendingPlanLoad();
    }
  }, [cancelPendingPlanLoad, isMenuOpen]);

  const fetchPlan = React.useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    planRequestAbortRef.current?.abort();
    const controller = new AbortController();
    planRequestAbortRef.current = controller;

    setPlanStatus("loading");

    try {
      const response = await fetch("/api/billing/balance", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load balance");
      }

      const data: {
        creditsRemaining?: number | null;
        creditsTotal?: number | null;
        plan: {
          name?: string | null;
          priceInPaise?: number | null;
        } | null;
      } = await response.json();

      if (controller.signal.aborted) {
        return;
      }

      let label: string | null = null;
      if (data.plan) {
        const formatter = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        });
        const priceLabel =
          typeof data.plan.priceInPaise === "number"
            ? formatter.format(data.plan.priceInPaise / 100)
            : null;

        label =
          data.plan.name && priceLabel
            ? `${data.plan.name} (${priceLabel})`
            : (data.plan.name ?? priceLabel ?? null);
      }
      const total = Number(data.creditsTotal);
      const remaining = Number(data.creditsRemaining);
      setPlan({
        credits:
          Number.isFinite(total) && total > 0 && Number.isFinite(remaining)
            ? { remaining: Math.max(0, remaining), total }
            : null,
        label,
      });
      setPlanStatus("ready");
    } catch (_error) {
      if (!controller.signal.aborted) {
        setPlan(null);
        setPlanStatus("error");
        planLoadTriggeredRef.current = false;
      }
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      resetPlanState();
    }
  }, [isAuthenticated, resetPlanState]);

  React.useEffect(() => {
    return () => {
      if (planLoadTimerRef.current) {
        clearTimeout(planLoadTimerRef.current);
        planLoadTimerRef.current = null;
      }
      planRequestAbortRef.current?.abort();
    };
  }, []);

  const handleSelect = React.useCallback(
    (
      event: Event,
      {
        callback,
        skipProgress,
      }: {
        callback: () => void;
        skipProgress?: boolean;
      }
    ) => {
      event.preventDefault();
      if (isBusy) {
        return;
      }
      // Give immediate feedback: close the menu right away so the user doesn't
      // keep clicking while the next route loads.
      closeMenuImmediately();
      const shouldSkip = skipProgress ?? false;
      if (shouldSkip) {
        callback();
        return;
      }
      onActionStart?.();
      callback();
    },
    [closeMenuImmediately, isBusy, onActionStart]
  );

  const handleMenuOpenChange = React.useCallback(
    (open: boolean) => {
      setIsMenuOpen(open);
      if (open) {
        setHasOpenedMenu(true);
        onOpenChange?.(true);
        if (isAuthenticated && !planLoadTriggeredRef.current) {
          planLoadTriggeredRef.current = true;
          // Show "Checking plan..." straight away; the request itself waits
          // briefly so a quick open-and-close does not hit the API.
          setPlanStatus((current) => (current === "ready" ? current : "loading"));
          planLoadTimerRef.current = setTimeout(() => {
            planLoadTimerRef.current = null;
            fetchPlan().catch((error) =>
              console.warn("Failed to load plan", error)
            );
          }, PLAN_LOAD_DELAY_MS);
        }
        return;
      }

      onOpenChange?.(false);
      onMenuClose?.();
      cancelPendingPlanLoad();
      setIsLanguageOpen(false);
      setIsResourcesOpen(false);
    },
    [cancelPendingPlanLoad, fetchPlan, isAuthenticated, onMenuClose, onOpenChange]
  );

  React.useEffect(() => {
    const handler = () => {
      handleMenuOpenChange(false);
    };
    window.addEventListener("user-menu-close-request", handler);
    return () => window.removeEventListener("user-menu-close-request", handler);
  }, [handleMenuOpenChange]);

  /** Rows that expand inline keep the menu open instead of selecting. */
  const toggleSection = React.useCallback(
    (event: Event, section: "language" | "resources") => {
      event.preventDefault();
      if (section === "language") {
        setIsLanguageOpen((current) => !current);
        setIsResourcesOpen(false);
      } else {
        setIsResourcesOpen((current) => !current);
        setIsLanguageOpen(false);
      }
    },
    []
  );

  const showSignOut = Boolean(isAuthenticated && onSignOut);
  const isDark = resolvedTheme === "dark";
  const primaryLabel =
    (userDisplayName && userDisplayName.trim().length > 0
      ? userDisplayName.trim()
      : null) ??
    userEmail ??
    null;
  const _shouldSkipPathProgress = React.useCallback(
    (path: string | null | undefined) =>
      path && currentPathname ? currentPathname === path : false,
    [currentPathname]
  );
  const activeLanguageName =
    languageOptions.find((language) => language.code === activeLanguageCode)
      ?.name ?? null;
  const planLabel =
    planStatus === "loading"
      ? translate("user_menu.manage_subscriptions_status_checking", "Checking plan...")
      : planStatus === "error"
        ? translate(
            "user_menu.manage_subscriptions_status_unavailable",
            "Plan unavailable"
          )
        : (plan?.label ??
          translate("user_menu.manage_subscriptions_status_fallback", "Free Plan"));
  const planCredits = plan?.credits
    ? {
        percent: (plan.credits.remaining / plan.credits.total) * 100,
        remaining: creditFormatter.format(plan.credits.remaining),
        summary: (
          <EditableTranslation
            defaultText="of {total} credits left"
            translationKey="recharge.current_balance.of_total"
            values={{ total: creditFormatter.format(plan.credits.total) }}
          />
        ),
      }
    : null;
  const showInternalTools = isAdmin || canEditTranslations;

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={handleMenuOpenChange}
      open={isMenuOpen}
    >
      <DropdownMenuTrigger
        asChild
        data-user-menu-trigger="1"
        ref={dropdownTriggerRef}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[min(20rem,calc(100vw-1rem))] min-w-0 rounded-2xl p-1.5 shadow-xl"
        collisionPadding={8}
        data-testid="user-nav-menu"
        side={side}
        sideOffset={8}
      >
        {isAuthenticated ? (
          <>
            {primaryLabel ? (
              <UserMenuIdentity
                avatarColor={getAvatarColor(userEmail ?? primaryLabel)}
                avatarSrc={avatarSrc}
                email={userEmail ?? null}
                href="/profile"
                initials={getInitials(userDisplayName ?? null, userEmail ?? null)}
                name={primaryLabel}
                nameTestId="user-nav-item-email"
              />
            ) : null}
            <UserMenuPlanCard
              action={
                <UserMenuPrimaryAction
                  href="/recharge"
                  icon={Sparkles}
                  label={
                    <EditableTranslation
                      defaultText="Upgrade plan"
                      translationKey="user_menu.upgrade_plan"
                    />
                  }
                  testId="user-nav-item-upgrade-plan"
                />
              }
              credits={planCredits}
              href="/subscriptions"
              icon={CreditCard}
              isLoading={planStatus === "loading"}
              planLabel={planLabel}
              testId="user-nav-item-manage-subscriptions"
              title={
                <EditableTranslation
                  defaultText="Manage Subscriptions"
                  translationKey="user_menu.manage_subscriptions"
                />
              }
            />
            <UserMenuRow
              data-testid="user-nav-item-profile"
              href="/profile"
              icon={User}
              label={
                <EditableTranslation
                  defaultText="Profile"
                  translationKey="user_menu.profile"
                />
              }
            />
            {isCreator ? (
              <UserMenuRow
                data-testid="user-nav-item-creator"
                href="/creator-dashboard"
                icon={Wallet}
                label={
                  <EditableTranslation
                    defaultText="Earnings dashboard"
                    translationKey="referrals.dashboard_label"
                  />
                }
              />
            ) : null}
          </>
        ) : null}

        {forumEnabled ? (
          <UserMenuRow
            data-testid="user-nav-item-forum"
            href="/forum"
            icon={MessagesSquare}
            label={
              <EditableTranslation
                defaultText="Community Forum"
                translationKey="user_menu.community_forum"
              />
            }
          />
        ) : null}
        {isAuthenticated || forumEnabled ? <UserMenuDivider /> : null}

        {languageOptions.length > 0 ? (
          <>
            <UserMenuRow
              data-testid="user-nav-item-language"
              expanded={isLanguageOpen}
              icon={Languages}
              label={
                <EditableTranslation
                  defaultText="Language"
                  translationKey="user_menu.language"
                />
              }
              onSelect={(event) => toggleSection(event, "language")}
              value={isLanguageOpen ? null : activeLanguageName}
            />
            {isLanguageOpen
              ? languageOptions.map((language) => {
                  const isActive = language.code === activeLanguageCode;
                  return (
                    <UserMenuSubItem
                      aria-label={
                        isActive
                          ? `${language.name}, ${translate("user_menu.language.active", "Active")}`
                          : language.name
                      }
                      data-testid={`user-nav-item-language-${language.code}`}
                      disabled={isLanguageUpdating && !isActive}
                      key={language.code}
                      label={
                        isActive && isLanguageUpdating
                          ? `${language.name} · ${translate("user_menu.language.updating", "Updating...")}`
                          : language.name
                      }
                      onSelect={(event) =>
                        handleSelect(event, {
                          callback: () => onLanguageChange?.(language.code),
                        })
                      }
                      pending={isActive && isLanguageUpdating}
                      selected={isActive}
                    />
                  );
                })
              : null}
          </>
        ) : null}
        <UserMenuRow
          data-testid="user-nav-item-more"
          expanded={isResourcesOpen}
          icon={BookOpen}
          label={
            <EditableTranslation
              defaultText="Resources"
              translationKey="user_menu.resources"
            />
          }
          onSelect={(event) => toggleSection(event, "resources")}
        />
        {isResourcesOpen
          ? INFO_LINKS.map((item) => (
              <UserMenuSubItem
                data-testid={item.testId}
                href={item.path}
                key={item.path}
                label={
                  <EditableTranslation
                    defaultText={item.defaultLabel}
                    translationKey={item.labelKey}
                  />
                }
              />
            ))
          : null}
        {/* The label names the mode the row switches to, so it reads
            "Light mode" while dark and "Dark mode" while light. */}
        <UserMenuRow
          aria-label={
            isDark
              ? translate("user_menu.theme.light", "Light mode")
              : translate("user_menu.theme.dark", "Dark mode")
          }
          data-testid="user-nav-item-theme"
          icon={isDark ? Sun : Moon}
          label={
            isDark ? (
              <EditableTranslation
                defaultText="Light mode"
                translationKey="user_menu.theme.light"
              />
            ) : (
              <EditableTranslation
                defaultText="Dark mode"
                translationKey="user_menu.theme.dark"
              />
            )
          }
          onSelect={(event) => {
            // The label flips in place, so keep the menu open.
            event.preventDefault();
            if (isBusy) {
              return;
            }
            onToggleTheme();
          }}
        />

        {isAuthenticated && showInternalTools ? (
          <>
            <UserMenuDivider />
            {isAdmin ? (
              <UserMenuRow
                data-testid="user-nav-item-admin"
                icon={ShieldCheck}
                label={
                  <EditableTranslation
                    defaultText="Admin Console"
                    translationKey="user_menu.admin_console"
                  />
                }
                onSelect={(event) =>
                  handleSelect(event, {
                    callback: () => {
                      window.open("/admin", "_blank", "noopener,noreferrer");
                      setIsMenuOpen(false);
                    },
                    skipProgress: true,
                  })
                }
                trailingIcon={ExternalLink}
              />
            ) : null}
            {canEditTranslations ? (
              <UserMenuRow
                data-testid="user-nav-item-translation-edit-mode"
                icon={PenLine}
                label={
                  translationEditEnabled
                    ? translate(
                        "translation_edit.mode.disable",
                        "Disable translation edit mode"
                      )
                    : translate(
                        "translation_edit.mode.enable",
                        "Enable translation edit mode"
                      )
                }
                onSelect={(event) =>
                  handleSelect(event, {
                    callback: toggleTranslationEdit,
                    skipProgress: true,
                  })
                }
                switchValue={translationEditEnabled}
              />
            ) : null}
          </>
        ) : null}

        {showSignOut ? (
          <>
            <UserMenuDivider />
            <UserMenuRow
              data-testid="user-nav-item-auth"
              destructive
              icon={LogOut}
              label={
                <EditableTranslation
                  defaultText="Sign out"
                  translationKey="user_menu.sign_out"
                />
              }
              onSelect={(event) =>
                onSignOut &&
                handleSelect(event, {
                  callback: onSignOut,
                })
              }
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
