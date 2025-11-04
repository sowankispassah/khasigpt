"use client";

import { EllipsisVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/icons";
import { UserDropdownMenu, UserMenuTrigger } from "@/components/user-dropdown-menu";
import { useTranslation } from "@/components/language-provider";
import { cn } from "@/lib/utils";

export function PageUserMenu({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const { translate, isUpdating: isLanguageUpdating } = useTranslation();
  const [isActionPending, setIsActionPending] = useState(false);
  const user = session?.user ?? null;

  useEffect(() => {
    setIsActionPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLanguageUpdating) {
      setIsActionPending(false);
    }
  }, [isLanguageUpdating]);

  useEffect(() => {
    if (user) {
      void router.prefetch("/profile");
      void router.prefetch("/subscriptions");
      void router.prefetch("/recharge");
      if (user.role === "admin") {
        void router.prefetch("/admin");
      }
    }
  }, [router, user]);

  const beginAction = () => {
    setIsActionPending(true);
  };

  const handleNavigate = (path: string) => {
    if (path === pathname) {
      setIsActionPending(false);
      return;
    }
    beginAction();
    router.push(path);
  };

  const handleToggleTheme = () => {
    beginAction();
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    setTimeout(() => setIsActionPending(false), 250);
  };

  const handleSignOut = () => {
    beginAction();
    void signOut({ redirectTo: "/login" });
  };

  const handleMenuClosed = () => {
    setIsActionPending(false);
  };

  const isBusy = status === "loading" || isActionPending;

  return (
    <div
      className={cn(
        "fixed right-2 top-1.5 z-40 flex items-center",
        className
      )}
    >
      {status === "loading" ? (
        <Button className="h-8 w-8" disabled variant="outline">
          <span className="sr-only">
            {translate("user_menu.loading", "Loading user menu")}
          </span>
          <span className="animate-spin">
            <LoaderIcon size={16} />
          </span>
        </Button>
      ) : user ? (
        <UserDropdownMenu
          align="end"
          isAdmin={user.role === "admin"}
          isAuthenticated
          isBusy={isBusy}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
          onNavigate={handleNavigate}
          onSignOut={handleSignOut}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          userEmail={user.email ?? undefined}
          trigger={
            <UserMenuTrigger
              isBusy={isBusy}
              user={{
                name: user.name,
                email: user.email,
                imageVersion: user.imageVersion ?? null,
              }}
            />
          }
        />
      ) : (
        <UserDropdownMenu
          align="end"
          isAdmin={false}
          isAuthenticated={false}
          isBusy={isBusy}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
          onNavigate={handleNavigate}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          trigger={
            <button
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isBusy && "pointer-events-none opacity-70"
              )}
              type="button"
            >
              {isBusy ? (
                <span className="animate-spin">
                  <LoaderIcon size={16} />
                </span>
              ) : (
                <EllipsisVertical size={16} />
              )}
              <span className="sr-only">
                {translate("user_menu.open_menu", "Open menu")}
              </span>
            </button>
          }
        />
      )}
    </div>
  );
}
