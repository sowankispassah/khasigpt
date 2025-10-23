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
}: UserDropdownMenuProps) {
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
        className="w-(--radix-popper-anchor-width)"
        data-testid="user-nav-menu"
        side={side}
        align={align}
      >
        <DropdownMenuItem
          className="cursor-pointer"
          data-testid="user-nav-item-profile"
          onSelect={(event) =>
            handleSelect(event, () => onNavigate("/profile"))
          }
        >
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          data-testid="user-nav-item-theme"
          onSelect={(event) =>
            handleSelect(event, onToggleTheme)
          }
        >
          {`Toggle ${resolvedTheme === "light" ? "dark" : "light"} mode`}
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
