"use client";

import { EllipsisVertical } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  UserDropdownMenu,
  UserMenuTrigger,
} from "@/components/user-dropdown-menu";
import { cn } from "@/lib/utils";
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";

export function PageUserMenu({
  className,
  forumEnabled = true,
}: {
  className?: string;
  forumEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const { translate, isUpdating: isLanguageUpdating } = useTranslation();
  const [isActionPending, setIsActionPending] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasOpenedMenu, setHasOpenedMenu] = useState(false);
  const user = session?.user ?? null;
  const hasPrefetchedRoutesRef = useRef(false);
  const prefetchIdleRef = useRef<ReturnType<typeof runWhenIdle> | null>(null);
  const displayName = (() => {
    const first = user?.firstName?.trim() ?? "";
    const last = user?.lastName?.trim() ?? "";
    const combined = [first, last].filter(Boolean).join(" ").trim();
    if (combined.length > 0) {
      return combined;
    }
    if (user?.name && user.name.trim().length > 0) {
      return user.name.trim();
    }
    return null;
  })();

  useEffect(() => {
    setIsActionPending(false);
    if (typeof window !== "undefined") {
      const pendingPath = window.localStorage.getItem("user-menu:pending-path");
      if (pendingPath && pendingPath === pathname) {
        window.localStorage.removeItem("user-menu:pending-path");
        window.dispatchEvent(new CustomEvent("user-menu-close-request"));
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (!isLanguageUpdating) {
      setIsActionPending(false);
    }
  }, [isLanguageUpdating]);

  useEffect(() => {
    hasPrefetchedRoutesRef.current = false;
  }, []);

  const clearPrefetchIdle = useCallback(() => {
    cancelIdle(prefetchIdleRef.current);
    prefetchIdleRef.current = null;
  }, []);

  const prefetchUserRoutes = useCallback(() => {
    if (!user || hasPrefetchedRoutesRef.current || !shouldPrefetch()) {
      return;
    }
    hasPrefetchedRoutesRef.current = true;
    clearPrefetchIdle();
    prefetchIdleRef.current = runWhenIdle(() => {
      try {
        router.prefetch("/profile");
        router.prefetch("/subscriptions");
        router.prefetch("/recharge");
      } catch (error) {
        console.warn("Prefetch failed", error);
      }
      if (user.role === "admin") {
        try {
          router.prefetch("/admin");
        } catch (error) {
          console.warn("Prefetch failed", error);
        }
      }
      if (user.role === "creator") {
        try {
          router.prefetch("/creator-dashboard");
        } catch (error) {
          console.warn("Prefetch failed", error);
        }
      }
    });
  }, [clearPrefetchIdle, router, user]);

  useEffect(() => {
    return () => clearPrefetchIdle();
  }, [clearPrefetchIdle]);

  useEffect(() => {
    if (isMenuOpen) {
      setHasOpenedMenu(true);
    }
  }, [isMenuOpen]);

  const shouldFetchAvatar = isMenuOpen || hasOpenedMenu;

  const beginAction = () => {
    setIsActionPending(true);
  };
  const handleNavigate = (path: string) => {
    const isSameRoute = path === pathname;
    if (isSameRoute) {
      setIsActionPending(false);
      return;
    }
    beginAction();
    router.push(path);
    try {
      window.localStorage.setItem("user-menu:pending-path", path);
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleTheme = () => {
    beginAction();
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    setTimeout(() => setIsActionPending(false), 250);
  };

  const handleSignOut = () => {
    beginAction();
    signOut({ redirectTo: "/login" });
  };

  const handleMenuClosed = useCallback(() => {
    setIsActionPending(false);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsMenuOpen(open);
      if (open) {
        prefetchUserRoutes();
        setIsActionPending(false);
      } else {
        handleMenuClosed();
      }
    },
    [handleMenuClosed, prefetchUserRoutes]
  );

  const isBusy = status === "loading" || isActionPending;

  return (
    <div
      className={cn("fixed top-1.5 right-2 z-40 flex items-center", className)}
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
          currentPathname={pathname}
          forumEnabled={forumEnabled}
          isAdmin={user.role === "admin"}
          isAuthenticated
          isBusy={isBusy}
          isCreator={user.role === "creator"}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
          onNavigate={handleNavigate}
          onOpenChange={handleOpenChange}
          onSignOut={handleSignOut}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          trigger={
            <UserMenuTrigger
              isBusy={isBusy}
              shouldFetchAvatar={shouldFetchAvatar}
              user={{
                name: user.name,
                email: user.email,
                imageVersion: user.imageVersion ?? null,
              }}
            />
          }
          userDisplayName={displayName ?? undefined}
          userEmail={user.email ?? undefined}
        />
      ) : (
        <UserDropdownMenu
          align="end"
          currentPathname={pathname}
          forumEnabled={forumEnabled}
          isAdmin={false}
          isAuthenticated={false}
          isBusy={isBusy}
          isCreator={false}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
          onNavigate={handleNavigate}
          onOpenChange={handleOpenChange}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          trigger={
            <button
              aria-busy={isBusy}
              aria-disabled={isBusy}
              className={cn(
                "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isBusy && "pointer-events-none opacity-70"
              )}
              type="button"
            >
              <EllipsisVertical size={16} />
              <span className="sr-only">
                {translate("user_menu.open_menu", "Open menu")}
              </span>
            </button>
          }
          userDisplayName={undefined}
        />
      )}
    </div>
  );
}
