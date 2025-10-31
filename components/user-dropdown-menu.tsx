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
import { cn, fetcher } from "@/lib/utils";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  isAuthenticated: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onSignOut?: () => void;
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
};

export const UserMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  UserMenuTriggerProps
>(({ user, className, ...props }, ref) => {
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
        "flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/40 transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
  isAuthenticated,
  resolvedTheme,
  onToggleTheme,
  onNavigate,
  onSignOut,
  side = "top",
  align = "end",
  userEmail,
}: UserDropdownMenuProps) {
  const [planLabel, setPlanLabel] = React.useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(false);

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
              : (data.plan.name ?? priceLabel ?? null);

          setPlanLabel(label ?? "Free Plan");
        } else {
          setPlanLabel("Free Plan");
        }
      } catch (_error) {
        if (isMounted) {
          setPlanLabel("Free Plan");
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

  const handleSelect = (event: Event, callback: () => void) => {
    event.preventDefault();
    callback();
  };

  const showSignOut = Boolean(isAuthenticated && onSignOut);

  const infoLinks = (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        data-testid="user-nav-item-about"
        onSelect={(event) =>
          handleSelect(event, () => onNavigate("/about"))
        }
      >
        About Us
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        data-testid="user-nav-item-contact"
        onSelect={(event) =>
          handleSelect(event, () => onNavigate("/about#contact"))
        }
      >
        Contact Us
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        data-testid="user-nav-item-privacy"
        onSelect={(event) =>
          handleSelect(event, () => onNavigate("/privacy-policy"))
        }
      >
        Privacy Policy
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        data-testid="user-nav-item-terms"
        onSelect={(event) =>
          handleSelect(event, () => onNavigate("/terms-of-service"))
        }
      >
        Terms of Service
      </DropdownMenuItem>
    </>
  );

  return (
    <DropdownMenu>
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
              handleSelect(event, () => onNavigate("/profile"))
            }
          >
            {userEmail}
          </DropdownMenuItem>
        ) : null}
        {isAuthenticated && (
          <>
            {userEmail ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-profile"
              onSelect={(event) =>
                handleSelect(event, () => onNavigate("/profile"))
              }
            >
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex cursor-pointer flex-col items-start gap-1"
              data-testid="user-nav-item-manage-subscriptions"
              onSelect={(event) =>
                handleSelect(event, () => onNavigate("/subscriptions"))
              }
            >
              Manage Subscriptions
              <span className="text-muted-foreground text-xs opacity-80">
                {isPlanLoading ? "Checking plan..." : planLabel ?? "Free Plan"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-upgrade-plan"
              onSelect={(event) =>
                handleSelect(event, () => onNavigate("/recharge"))
              }
            >
              Upgrade plan
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem
                className="cursor-pointer"
                data-testid="user-nav-item-admin"
                onSelect={(event) =>
                  handleSelect(event, () => onNavigate("/admin"))
                }
              >
                Open admin console
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        )}

        {isAuthenticated ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className="cursor-pointer"
              data-testid="user-nav-item-more"
            >
              Resources
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[12rem]">
              {infoLinks}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          infoLinks
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          data-testid="user-nav-item-theme"
          onSelect={(event) => handleSelect(event, onToggleTheme)}
        >
          {resolvedTheme === "light" ? "Dark mode" : "Light mode"}
        </DropdownMenuItem>
        {showSignOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              data-testid="user-nav-item-auth"
              onSelect={(event) =>
                onSignOut && handleSelect(event, onSignOut)
              }
            >
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

