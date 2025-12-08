"use client";

import { EllipsisVertical } from "lucide-react";
import React from "react";
import useSWR from "swr";
import { useTranslation } from "@/components/language-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, fetcher } from "@/lib/utils";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  isCreator?: boolean;
  isAuthenticated: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onSignOut?: () => void;
  onActionStart?: () => void;
  onMenuClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  isBusy?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  userDisplayName?: string;
  userEmail?: string;
  currentPathname?: string | null;
  forumEnabled?: boolean;
};

const AVATAR_COLORS = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
];
const NON_ALPHA_REGEX = /[^a-zA-Z\s]/g;
const WHITESPACE_SPLIT_REGEX = /\s+/;

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

export function getAvatarColor(key?: string | null) {
  const value = key ?? "";
  if (!value) {
    return AVATAR_COLORS[0];
  }
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

type BasicUser = {
  name?: string | null;
  email?: string | null;
  imageVersion?: string | null;
};

type UserMenuTriggerProps = React.ComponentPropsWithoutRef<"button"> & {
  user: BasicUser;
  isBusy?: boolean;
};

export const UserMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  UserMenuTriggerProps
>(({ user, className, isBusy = false, ...props }, ref) => {
  const initials = getInitials(user.name, user.email);
  const avatarColor = getAvatarColor(user.email ?? user.name ?? undefined);
  const avatarKey =
    user.imageVersion === undefined
      ? null
      : `/api/profile/avatar?v=${encodeURIComponent(
          user.imageVersion ?? "none"
        )}`;
  const { data } = useSWR<{ image: string | null }>(avatarKey, fetcher, {
    revalidateOnFocus: false,
  });
  const avatarSrc = data?.image ?? null;

  return (
    <button
      aria-busy={isBusy}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/40 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      ref={ref}
      type="button"
      {...props}
    >
      <span className="flex h-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
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

export function UserDropdownMenu({
  trigger,
  isAdmin,
  isCreator = false,
  isAuthenticated,
  resolvedTheme,
  onToggleTheme,
  onNavigate,
  onSignOut,
  onActionStart,
  onMenuClose,
  onOpenChange,
  isBusy = false,
  side = "top",
  align = "end",
  userDisplayName,
  userEmail,
  currentPathname,
  forumEnabled = true,
}: UserDropdownMenuProps) {
  const [planLabel, setPlanLabel] = React.useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = React.useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [pendingLanguageCode, setPendingLanguageCode] = React.useState<
    string | null
  >(null);
  const [isMenuProgressVisible, setIsMenuProgressVisible] =
    React.useState(false);
  const [menuProgress, setMenuProgress] = React.useState(0);
  const dropdownTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const ignoreNextResourcesOpenRef = React.useRef(false);
  const ignoreNextLanguageOpenRef = React.useRef(false);
  const planRequestAbortRef = React.useRef<AbortController | null>(null);
  const planLoadTriggeredRef = React.useRef(false);
  const progressTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const {
    languages: translationLanguages,
    activeLanguage,
    translate,
    setLanguage,
    isUpdating: isLanguageUpdating,
  } = useTranslation();

  const resetPlanState = React.useCallback(() => {
    planRequestAbortRef.current?.abort();
    planRequestAbortRef.current = null;
    planLoadTriggeredRef.current = false;
    setPlanLabel(null);
    setIsPlanLoading(false);
  }, []);

  const fetchPlan = React.useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    planRequestAbortRef.current?.abort();
    const controller = new AbortController();
    planRequestAbortRef.current = controller;

    setIsPlanLoading(true);

    try {
      const response = await fetch("/api/billing/balance", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load balance");
      }

      const data: {
        plan: {
          name?: string | null;
          priceInPaise?: number | null;
        } | null;
      } = await response.json();

      if (controller.signal.aborted) {
        return;
      }

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

        const label =
          data.plan.name && priceLabel
            ? `${data.plan.name} (${priceLabel})`
            : (data.plan.name ?? priceLabel ?? null);

        setPlanLabel(label ?? null);
      } else {
        setPlanLabel(null);
      }
    } catch (_error) {
      if (!controller.signal.aborted) {
        setPlanLabel(null);
        planLoadTriggeredRef.current = false;
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsPlanLoading(false);
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
      planRequestAbortRef.current?.abort();
    };
  }, []);

  const clearProgressTimers = React.useCallback(() => {
    for (const timerId of progressTimersRef.current) {
      clearTimeout(timerId);
    }
    progressTimersRef.current = [];
  }, []);

  const hideMenuProgress = React.useCallback(() => {
    clearProgressTimers();
    setIsMenuProgressVisible(false);
    setMenuProgress(0);
  }, [clearProgressTimers]);

  const startMenuProgress = React.useCallback(() => {
    clearProgressTimers();
    setIsMenuProgressVisible(true);
    setMenuProgress(12);
    const timers = [
      setTimeout(() => setMenuProgress(45), 120),
      setTimeout(() => setMenuProgress(70), 260),
      setTimeout(() => setMenuProgress(90), 520),
    ];
    progressTimersRef.current = timers;
  }, [clearProgressTimers]);

  React.useEffect(() => {
    if (!isBusy) {
      setPendingAction(null);
    }
  }, [isBusy]);

  React.useEffect(() => {
    if (
      !isBusy &&
      !isLanguageUpdating &&
      !pendingAction &&
      !pendingLanguageCode
    ) {
      hideMenuProgress();
    }
  }, [
    hideMenuProgress,
    isBusy,
    isLanguageUpdating,
    pendingAction,
    pendingLanguageCode,
  ]);

  React.useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  const handleSelect = React.useCallback(
    (
      event: Event,
      {
        actionType,
        actionId,
        callback,
        skipProgress,
      }: {
        actionType: "navigate" | "theme" | "signOut" | "language";
        actionId: string | null;
        callback: () => void;
        skipProgress?: boolean;
      }
    ) => {
      event.preventDefault();
      if (isBusy && actionType !== "language") {
        return;
      }
      const shouldSkip = skipProgress ?? false;
      if (shouldSkip) {
        setPendingAction(null);
        callback();
        return;
      }
      startMenuProgress();
      onActionStart?.();
      if (actionType !== "language") {
        setPendingAction(actionId ?? actionType);
      }
      callback();
    },
    [isBusy, onActionStart, startMenuProgress]
  );

  const handleMenuOpenChange = React.useCallback(
    (open: boolean) => {
      setIsMenuOpen(open);
      if (open) {
        onOpenChange?.(true);
        if (isAuthenticated && !planLoadTriggeredRef.current) {
          planLoadTriggeredRef.current = true;
          fetchPlan().catch((error) =>
            console.warn("Failed to load plan", error)
          );
        }
        return;
      }

      onOpenChange?.(false);
      onMenuClose?.();
      ignoreNextResourcesOpenRef.current = false;
      ignoreNextLanguageOpenRef.current = false;
      setIsResourcesOpen(false);
      setIsLanguageOpen(false);
      setPendingAction(null);
      setPendingLanguageCode(null);
      hideMenuProgress();
    },
    [fetchPlan, isAuthenticated, onMenuClose, onOpenChange, hideMenuProgress]
  );

  React.useEffect(() => {
    const handler = () => {
      handleMenuOpenChange(false);
    };
    window.addEventListener("user-menu-close-request", handler);
    return () => window.removeEventListener("user-menu-close-request", handler);
  }, [handleMenuOpenChange]);

  const toggleResources = React.useCallback(() => {
    setIsResourcesOpen((prev) => {
      const next = !prev;
      ignoreNextResourcesOpenRef.current = !next;
      return next;
    });
  }, []);

  const handleResourcesPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggleResources();
    },
    [toggleResources]
  );

  const handleResourcesKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        toggleResources();
      }
    },
    [toggleResources]
  );

  const handleResourcesOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      if (ignoreNextResourcesOpenRef.current) {
        ignoreNextResourcesOpenRef.current = false;
        return;
      }
      setIsResourcesOpen(true);
      return;
    }

    ignoreNextResourcesOpenRef.current = false;
    setIsResourcesOpen(false);
  }, []);

  const handleLanguageSelect = React.useCallback(
    (event: Event, code: string) => {
      handleSelect(event, {
        actionType: "language",
        actionId: code,
        callback: () => {
          setPendingLanguageCode(code);
          setLanguage(code);
        },
      });
    },
    [setLanguage, handleSelect]
  );

  React.useEffect(() => {
    if (!isLanguageUpdating && pendingLanguageCode) {
      setPendingLanguageCode(null);
      setIsLanguageOpen(false);
      ignoreNextLanguageOpenRef.current = false;
    }
  }, [isLanguageUpdating, pendingLanguageCode]);

  const showSignOut = Boolean(isAuthenticated && onSignOut);

  const infoLinks = [
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
  ];

  const renderInfoLinks = (className?: string) =>
    infoLinks.map((item) => (
      <DropdownMenuItem
        className={cn("cursor-pointer", className)}
        data-testid={item.testId}
        key={item.path}
        onSelect={(event) =>
          handleSelect(event, {
            actionType: "navigate",
            actionId: item.path,
            callback: () => {
              ignoreNextResourcesOpenRef.current = false;
              setIsResourcesOpen(false);
              onNavigate(item.path);
            },
            skipProgress: currentPathname === item.path,
          })
        }
      >
        <span className="flex w-full items-center justify-between gap-2">
          {translate(item.labelKey, item.defaultLabel)}
        </span>
      </DropdownMenuItem>
    ));

  const activeLanguageLabel = translate("user_menu.language.active", "Active");
  const updatingLanguageLabel = translate(
    "user_menu.language.updating",
    "Updating…"
  );
  const primaryLabel =
    (userDisplayName && userDisplayName.trim().length > 0
      ? userDisplayName.trim()
      : null) ??
    userEmail ??
    null;
  const shouldSkipPathProgress = React.useCallback(
    (path: string | null | undefined) =>
      path && currentPathname ? currentPathname === path : false,
    [currentPathname]
  );

  return (
    <>
      {isMenuProgressVisible ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${menuProgress}%` }}
          />
        </div>
      ) : null}
      <DropdownMenu onOpenChange={handleMenuOpenChange} open={isMenuOpen}>
        <DropdownMenuTrigger
          asChild
          data-user-menu-trigger="1"
          ref={dropdownTriggerRef}
        >
          {trigger}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="min-w-[16rem]"
          data-testid="user-nav-menu"
          side={side}
        >
          {primaryLabel && isAuthenticated ? (
            <DropdownMenuItem
              className="cursor-pointer font-medium text-foreground"
              data-testid="user-nav-item-email"
              onSelect={(event) =>
                handleSelect(event, {
                  actionType: "navigate",
                  actionId: "navigate:profile-email",
                  callback: () => onNavigate("/profile"),
                  skipProgress: shouldSkipPathProgress("/profile"),
                })
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {primaryLabel}
              </span>
            </DropdownMenuItem>
          ) : null}
          {isAuthenticated && (
            <>
              {primaryLabel ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="user-nav-item-profile"
                onSelect={(event) =>
                  handleSelect(event, {
                    actionType: "navigate",
                    actionId: "navigate:profile",
                    callback: () => onNavigate("/profile"),
                    skipProgress: shouldSkipPathProgress("/profile"),
                  })
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  {translate("user_menu.profile", "Profile")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer flex-col items-start gap-1"
                data-testid="user-nav-item-manage-subscriptions"
                onSelect={(event) =>
                  handleSelect(event, {
                    actionType: "navigate",
                    actionId: "navigate:subscriptions",
                    callback: () => onNavigate("/subscriptions"),
                    skipProgress: shouldSkipPathProgress("/subscriptions"),
                  })
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  {translate(
                    "user_menu.manage_subscriptions",
                    "Manage Subscriptions"
                  )}
                </span>
                <span className="text-muted-foreground text-xs opacity-80">
                  {isPlanLoading
                    ? translate(
                        "user_menu.manage_subscriptions_status_checking",
                        "Checking plan..."
                      )
                    : (planLabel ??
                      translate(
                        "user_menu.manage_subscriptions_status_fallback",
                        "Free Plan"
                      ))}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="user-nav-item-upgrade-plan"
                onSelect={(event) =>
                  handleSelect(event, {
                    actionType: "navigate",
                    actionId: "navigate:recharge",
                    callback: () => onNavigate("/recharge"),
                    skipProgress: shouldSkipPathProgress("/recharge"),
                  })
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  {translate("user_menu.upgrade_plan", "Upgrade plan")}
                </span>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  data-testid="user-nav-item-admin"
                  onSelect={(event) =>
                    handleSelect(event, {
                      actionType: "navigate",
                      actionId: "navigate:admin",
                      callback: () => {
                        window.open("/admin", "_blank", "noopener,noreferrer");
                        setIsMenuOpen(false);
                      },
                      skipProgress: true,
                    })
                  }
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    {translate(
                      "user_menu.open_admin_console",
                      "Open admin console"
                    )}
                  </span>
                </DropdownMenuItem>
              ) : null}
              {isCreator ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  data-testid="user-nav-item-creator"
                  onSelect={(event) =>
                    handleSelect(event, {
                      actionType: "navigate",
                      actionId: "navigate:creator",
                      callback: () => onNavigate("/creator-dashboard"),
                      skipProgress:
                        shouldSkipPathProgress("/creator-dashboard"),
                    })
                  }
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    {translate(
                      "user_menu.creator_dashboard",
                      "Creator dashboard"
                    )}
                  </span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          )}

          {forumEnabled ? (
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-forum"
              onSelect={(event) =>
                handleSelect(event, {
                  actionType: "navigate",
                  actionId: "navigate:forum",
                  callback: () => onNavigate("/forum"),
                  skipProgress: shouldSkipPathProgress("/forum"),
                })
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {translate("user_menu.community_forum", "Community Forum")}
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuSub
            onOpenChange={handleResourcesOpenChange}
            open={isResourcesOpen}
          >
            <DropdownMenuSubTrigger
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 sm:w-auto sm:justify-start [&>svg]:ml-1 [&>svg]:shrink-0 [&>svg]:transition-transform",
                "data-[state=open]:[&>svg]:-rotate-90 [&>svg]:rotate-90 sm:[&>svg]:rotate-0 sm:data-[state=open]:[&>svg]:rotate-0"
              )}
              data-testid="user-nav-item-more"
              onKeyDown={handleResourcesKeyDown}
              onPointerDown={handleResourcesPointerDown}
            >
              {translate("user_menu.resources", "Resources")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-full min-w-0 rounded-md border bg-popover p-1 shadow-none max-sm:ml-[7px] sm:w-auto sm:min-w-[12rem] sm:shadow-lg">
              {renderInfoLinks()}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub
            onOpenChange={(open) => {
              if (open) {
                if (ignoreNextLanguageOpenRef.current) {
                  ignoreNextLanguageOpenRef.current = false;
                  return;
                }
                setIsLanguageOpen(true);
                return;
              }
              ignoreNextLanguageOpenRef.current = false;
              setIsLanguageOpen(false);
            }}
            open={isLanguageOpen}
          >
            <DropdownMenuSubTrigger
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 sm:w-auto sm:justify-start",
                "[&>svg]:ml-1 [&>svg]:shrink-0 [&>svg]:transition-transform",
                "data-[state=open]:[&>svg]:-rotate-90 [&>svg]:rotate-90 sm:[&>svg]:rotate-0 sm:data-[state=open]:[&>svg]:rotate-0"
              )}
              data-testid="user-nav-item-language"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsLanguageOpen((prev) => {
                    const next = !prev;
                    ignoreNextLanguageOpenRef.current = !next;
                    return next;
                  });
                }
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsLanguageOpen((prev) => {
                  const next = !prev;
                  ignoreNextLanguageOpenRef.current = !next;
                  return next;
                });
              }}
            >
              <span className="flex items-center gap-2">
                {translate("user_menu.language", "Language")}
                <span className="text-muted-foreground text-xs">
                  {activeLanguage.name}
                </span>
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-full min-w-0 rounded-md border bg-popover p-1 shadow-none sm:w-auto sm:min-w-[12rem] sm:shadow-lg">
              {translationLanguages.map((language) => (
                <DropdownMenuItem
                  className={cn(
                    "cursor-pointer justify-between",
                    language.code === activeLanguage.code
                      ? "font-medium text-primary"
                      : undefined
                  )}
                  data-testid={`user-nav-language-${language.code}`}
                  disabled={
                    isLanguageUpdating && language.code !== activeLanguage.code
                  }
                  key={language.code}
                  onSelect={(event) =>
                    handleLanguageSelect(event, language.code)
                  }
                >
                  {language.name}
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    {pendingLanguageCode === language.code
                      ? updatingLanguageLabel
                      : language.code === activeLanguage.code
                        ? isLanguageUpdating
                          ? updatingLanguageLabel
                          : activeLanguageLabel
                        : null}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            data-testid="user-nav-item-theme"
            onSelect={(event) =>
              handleSelect(event, {
                actionType: "theme",
                actionId: "theme",
                callback: onToggleTheme,
              })
            }
          >
            <span className="flex w-full items-center justify-between gap-2">
              {resolvedTheme === "light"
                ? translate("user_menu.theme.dark", "Dark mode")
                : translate("user_menu.theme.light", "Light mode")}
            </span>
          </DropdownMenuItem>
          {showSignOut ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                data-testid="user-nav-item-auth"
                onSelect={(event) =>
                  onSignOut &&
                  handleSelect(event, {
                    actionType: "signOut",
                    actionId: "signOut",
                    callback: onSignOut,
                  })
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  {translate("user_menu.sign_out", "Sign out")}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
