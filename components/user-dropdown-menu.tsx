"use client";

import { EllipsisVertical } from "lucide-react";
import * as React from "react";
import useSWR from "swr";
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
import { useTranslation } from "@/components/language-provider";
import { LoaderIcon } from "@/components/icons";
import { cn, fetcher } from "@/lib/utils";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  isAuthenticated: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onSignOut?: () => void;
  onActionStart?: () => void;
  onMenuClose?: () => void;
  isBusy?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  userEmail?: string;
};

export function getInitials(name?: string | null, email?: string | null) {
  const source = name ?? email ?? "";
  if (!source) {
    return "U";
  }

  const parts = source
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0 && email) {
    return email.slice(0, 1).toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return parts[0][0].toUpperCase();
}

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
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/40 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      aria-busy={isBusy}
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
  isAuthenticated,
  resolvedTheme,
  onToggleTheme,
  onNavigate,
  onSignOut,
  onActionStart,
  onMenuClose,
  isBusy = false,
  side = "top",
  align = "end",
  userEmail,
}: UserDropdownMenuProps) {
  const [planLabel, setPlanLabel] = React.useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = React.useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [pendingLanguageCode, setPendingLanguageCode] = React.useState<string | null>(null);
  const ignoreNextResourcesOpenRef = React.useRef(false);
  const ignoreNextLanguageOpenRef = React.useRef(false);
  const {
    languages: translationLanguages,
    activeLanguage,
    translate,
    setLanguage,
    isUpdating: isLanguageUpdating,
  } = useTranslation();

  React.useEffect(() => {
    if (!isAuthenticated) {
      setPlanLabel(null);
      setIsPlanLoading(false);
      return;
    }

    let isMounted = true;

    const loadPlan = async () => {
      try {
        setIsPlanLoading(true);
        const response = await fetch("/api/billing/balance", {
          cache: "no-store",
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

        if (!isMounted) {
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
              : data.plan.name ?? priceLabel ?? null;

          setPlanLabel(label ?? null);
        } else {
          setPlanLabel(null);
        }
      } catch (_error) {
        if (isMounted) {
          setPlanLabel(null);
        }
      } finally {
        if (isMounted) {
          setIsPlanLoading(false);
        }
      }
    };

    if (typeof window !== "undefined") {
      void loadPlan();
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (!isBusy) {
      setPendingAction(null);
    }
  }, [isBusy]);

  const handleSelect = (
    event: Event,
    actionType: "navigate" | "theme" | "signOut" | "language",
    actionId: string | null,
    callback: () => void
  ) => {
    event.preventDefault();
    if (isBusy && actionType !== "language") {
      return;
    }
    onActionStart?.();
    if (actionType !== "language") {
      setPendingAction(actionId ?? actionType);
    }
    callback();
  };

  const handleMenuOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      ignoreNextResourcesOpenRef.current = false;
      ignoreNextLanguageOpenRef.current = false;
      setIsResourcesOpen(false);
      setIsLanguageOpen(false);
      setPendingAction(null);
      setPendingLanguageCode(null);
    }
  }, []);

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
      handleSelect(event, "language", code, () => {
        setPendingLanguageCode(code);
        setLanguage(code);
      });
    },
    [setLanguage]
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

  const renderPendingIndicator = (visible: boolean) =>
    visible ? (
      <span className="text-muted-foreground">
        <LoaderIcon size={14} className="animate-spin" />
      </span>
    ) : null;

  const renderInfoLinks = (className?: string) =>
    infoLinks.map((item) => (
      <DropdownMenuItem
        key={item.path}
        className={cn("cursor-pointer", className)}
        data-testid={item.testId}
        onSelect={(event) =>
          handleSelect(event, "navigate", item.path, () => {
            ignoreNextResourcesOpenRef.current = false;
            setIsResourcesOpen(false);
            onNavigate(item.path);
          })
        }
      >
        <span className="flex w-full items-center justify-between gap-2">
          {translate(item.labelKey, item.defaultLabel)}
          {renderPendingIndicator(pendingAction === item.path)}
        </span>
      </DropdownMenuItem>
    ));

  const activeLanguageLabel = translate("user_menu.language.active", "Active");
  const updatingLanguageLabel = translate("user_menu.language.updating", "Updating…");

  return (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-[16rem]"
        data-testid="user-nav-menu"
        side={side}
      >
        {userEmail && isAuthenticated ? (
          <DropdownMenuItem
            className="cursor-pointer font-medium text-foreground"
            data-testid="user-nav-item-email"
            onSelect={(event) =>
              handleSelect(
                event,
                "navigate",
                "navigate:profile-email",
                () => onNavigate("/profile")
              )
            }
          >
            <span className="flex w-full items-center justify-between gap-2">
              {userEmail}
              {renderPendingIndicator(pendingAction === "navigate:profile-email")}
            </span>
          </DropdownMenuItem>
        ) : null}
        {isAuthenticated && (
          <>
            {userEmail ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-profile"
              onSelect={(event) =>
                handleSelect(
                  event,
                  "navigate",
                  "navigate:profile",
                  () => onNavigate("/profile")
                )
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {translate("user_menu.profile", "Profile")}
                {renderPendingIndicator(pendingAction === "navigate:profile")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex cursor-pointer flex-col items-start gap-1"
              data-testid="user-nav-item-manage-subscriptions"
              onSelect={(event) =>
                handleSelect(
                  event,
                  "navigate",
                  "navigate:subscriptions",
                  () => onNavigate("/subscriptions")
                )
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {translate(
                  "user_menu.manage_subscriptions",
                  "Manage Subscriptions"
                )}
                {renderPendingIndicator(pendingAction === "navigate:subscriptions")}
              </span>
              <span className="text-muted-foreground text-xs opacity-80">
                {isPlanLoading
                  ? translate(
                      "user_menu.manage_subscriptions_status_checking",
                      "Checking plan..."
                    )
                  : planLabel ??
                    translate(
                      "user_menu.manage_subscriptions_status_fallback",
                      "Free Plan"
                    )}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-upgrade-plan"
              onSelect={(event) =>
                handleSelect(
                  event,
                  "navigate",
                  "navigate:recharge",
                  () => onNavigate("/recharge")
                )
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {translate("user_menu.upgrade_plan", "Upgrade plan")}
                {renderPendingIndicator(pendingAction === "navigate:recharge")}
              </span>
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="user-nav-item-admin"
                onSelect={(event) =>
                  handleSelect(
                    event,
                    "navigate",
                    "navigate:admin",
                    () => onNavigate("/admin")
                  )
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  {translate(
                    "user_menu.open_admin_console",
                    "Open admin console"
                  )}
                  {renderPendingIndicator(pendingAction === "navigate:admin")}
                </span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuSub onOpenChange={handleResourcesOpenChange} open={isResourcesOpen}>
          <DropdownMenuSubTrigger
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 [&>svg]:ml-1 [&>svg]:shrink-0 [&>svg]:transition-transform sm:w-auto sm:justify-start",
              "[&>svg]:rotate-90 data-[state=open]:[&>svg]:-rotate-90 sm:[&>svg]:rotate-0 sm:data-[state=open]:[&>svg]:rotate-0"
            )}
            data-testid="user-nav-item-more"
            onKeyDown={handleResourcesKeyDown}
            onPointerDown={handleResourcesPointerDown}
          >
            {translate("user_menu.resources", "Resources")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-full min-w-0 rounded-md border bg-popover p-1 shadow-none max-sm:ml-[7px] sm:w-auto sm:min-w-[12rem] sm:shadow-lg"
          >
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
              "[&>svg]:rotate-90 data-[state=open]:[&>svg]:-rotate-90 sm:[&>svg]:rotate-0 sm:data-[state=open]:[&>svg]:rotate-0"
            )}
            data-testid="user-nav-item-language"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsLanguageOpen((prev) => {
                const next = !prev;
                ignoreNextLanguageOpenRef.current = !next;
                return next;
              });
            }}
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
                key={language.code}
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
                onSelect={(event) => handleLanguageSelect(event, language.code)}
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
                  {renderPendingIndicator(
                    pendingLanguageCode === language.code ||
                      (language.code === activeLanguage.code && isLanguageUpdating)
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          data-testid="user-nav-item-theme"
          onSelect={(event) => handleSelect(event, "theme", "theme", onToggleTheme)}
        >
          <span className="flex w-full items-center justify-between gap-2">
            {resolvedTheme === "light"
              ? translate("user_menu.theme.dark", "Dark mode")
              : translate("user_menu.theme.light", "Light mode")}
            {renderPendingIndicator(pendingAction === "theme")}
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
                handleSelect(event, "signOut", "signOut", onSignOut)
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                {translate("user_menu.sign_out", "Sign out")}
                {renderPendingIndicator(pendingAction === "signOut")}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
