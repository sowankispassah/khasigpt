'use client';

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserDropdownMenuProps = {
  trigger: React.ReactNode;
  isAdmin: boolean;
  resolvedTheme: string | undefined;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  userEmail?: string;
};

export function UserDropdownMenu({
  trigger,
  isAdmin,
  resolvedTheme,
  onToggleTheme,
  onNavigate,
  onSignOut,
  side = "top",
  align = "end",
  userEmail,
}: UserDropdownMenuProps) {
  const [planLabel, setPlanLabel] = React.useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    const loadPlan = async () => {
      try {
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
  }, []);

  const handleSelect = (
    event: Event,
    callback: () => void,
  ) => {
    event.preventDefault();
    callback();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-[16rem]"
        data-testid="user-nav-menu"
        side={side}
        align={align}
      >
        {userEmail ? (
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
        <DropdownMenuSeparator />
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
          className="cursor-pointer flex flex-col items-start gap-1"
          data-testid="user-nav-item-manage-subscriptions"
          onSelect={(event) =>
            handleSelect(event, () => onNavigate("/profile"))
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
        <DropdownMenuSeparator />
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
        {isAdmin && (
          <DropdownMenuItem
            className="cursor-pointer"
            data-testid="user-nav-item-admin"
            onSelect={(event) =>
              handleSelect(event, () => onNavigate("/admin"))
            }
          >
            Open admin console
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="cursor-pointer"
          data-testid="user-nav-item-theme"
          onSelect={(event) =>
            handleSelect(event, onToggleTheme)
          }
        >
          {resolvedTheme === "light" ? "Dark mode" : "Light mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          data-testid="user-nav-item-auth"
          onSelect={(event) => handleSelect(event, onSignOut)}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
