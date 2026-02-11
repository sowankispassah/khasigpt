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
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn, fetcher } from "@/lib/utils";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  isCreator?: boolean;
  isAuthenticated: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
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
  shouldFetchAvatar?: boolean;
};

export const UserMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  UserMenuTriggerProps
>(({ user, className, isBusy = false, shouldFetchAvatar = true, ...props }, ref) => {
  const initials = getInitials(user.name, user.email);
  const avatarColor = getAvatarColor(user.email ?? user.name ?? undefined);
  const [avatarOverride, setAvatarOverride] = React.useState<string | null>(
    null
  );
  const [versionOverride, setVersionOverride] = React.useState<
    string | null
  >(null);
  const avatarKey = shouldFetchAvatar
    ? `/api/profile/avatar?v=${encodeURIComponent(
        versionOverride ?? user.imageVersion ?? "none"
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
  const avatarSrc = avatarOverride ?? data?.image ?? null;

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
  currentPathname,
  forumEnabled = true,
}: UserDropdownMenuProps) {
  const [planLabel, setPlanLabel] = React.useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const dropdownTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const ignoreNextResourcesOpenRef = React.useRef(false);
  const planRequestAbortRef = React.useRef<AbortController | null>(null);
  const planLoadTriggeredRef = React.useRef(false);
  const { translate } = useTranslation();

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

  const handleSelect = React.useCallback(
    (
      event: Event,
      {
        actionType,
        callback,
        skipProgress,
      }: {
        actionType: "navigate" | "theme" | "signOut" | "language";
        callback: () => void;
        skipProgress?: boolean;
      }
    ) => {
      event.preventDefault();
      if (isBusy) {
        return;
      }
      const shouldSkip = skipProgress ?? false;
      if (shouldSkip) {
        callback();
        return;
      }
      onActionStart?.();
      if (actionType === "navigate" || actionType === "signOut") {
        startGlobalProgress();
      }
      callback();
    },
    [isBusy, onActionStart]
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
      setIsResourcesOpen(false);
    },
    [fetchPlan, isAuthenticated, onMenuClose, onOpenChange]
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
          {languageOptions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className="flex w-full cursor-pointer items-center justify-between gap-2 sm:w-auto sm:justify-start"
                  data-testid="user-nav-item-language"
                >
                  {translate("user_menu.language", "Language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-full min-w-0 rounded-md border bg-popover p-1 shadow-none max-sm:ml-[7px] sm:w-auto sm:min-w-[12rem] sm:shadow-lg">
                  {languageOptions.map((language) => (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      data-testid={`user-nav-item-language-${language.code}`}
                      disabled={
                        isLanguageUpdating &&
                        language.code !== activeLanguageCode
                      }
                      key={language.code}
                      onSelect={(event) =>
                        handleSelect(event, {
                          actionType: "language",
                          callback: () => onLanguageChange?.(language.code),
                        })
                      }
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{language.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {language.code === activeLanguageCode
                            ? isLanguageUpdating
                              ? translate(
                                  "user_menu.language.updating",
                                  "Updating..."
                                )
                              : translate(
                                  "user_menu.language.active",
                                  "Active"
                                )
                            : null}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            data-testid="user-nav-item-theme"
            onSelect={(event) =>
              handleSelect(event, {
                actionType: "theme",
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
  );
}
