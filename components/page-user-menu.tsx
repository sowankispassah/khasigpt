"use client";

import { EllipsisVertical } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const {
    translate,
    languages,
    activeLanguage,
    setLanguage,
    isUpdating: isLanguageUpdating,
  } = useTranslation();
  const [pendingChatLanguage, setPendingChatLanguage] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [menuLanguageChangeStarted, setMenuLanguageChangeStarted] =
    useState(false);
  const [chatLanguageSwitching, setChatLanguageSwitching] = useState(false);
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
      setMenuLanguageChangeStarted(false);
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
  const interfaceLanguageSwitchingVisible =
    menuLanguageChangeStarted && isLanguageUpdating && !pendingChatLanguage;
  const overlayVisible = interfaceLanguageSwitchingVisible || chatLanguageSwitching;
  const overlayMessage = chatLanguageSwitching
    ? translate(
        "user_menu.language.chat_prompt.loading",
        "Switching chat language..."
      )
    : translate(
        "chat.language.ui_prompt.loading",
        "Switching interface language..."
      );
  const handleLanguageChange = useCallback(
    (code: string) => {
      setIsActionPending(true);
      setMenuLanguageChangeStarted(true);
      setLanguage(code);
      const selected =
        languages.find((language) => language.code === code) ?? null;
      if (selected) {
        setPendingChatLanguage({
          code: selected.code,
          name: selected.name,
        });
      } else {
        setPendingChatLanguage(null);
      }
    },
    [languages, setLanguage]
  );
  const handleChatLanguageConfirm = useCallback((code: string) => {
    setChatLanguageSwitching(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("chat-language-preference", code);
      } catch {
        // Ignore storage errors.
      }
      try {
        const encoded = encodeURIComponent(code);
        document.cookie = `chat-language=${encoded}; path=/; max-age=${
          60 * 60 * 24 * 365
        }; samesite=lax`;
      } catch {
        // Ignore cookie errors.
      }
      window.dispatchEvent(
        new CustomEvent("chat-language-change", { detail: { code } })
      );
      window.setTimeout(() => {
        setChatLanguageSwitching(false);
      }, 900);
      return;
    }
    setChatLanguageSwitching(false);
  }, []);

  return (
    <>
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
          activeLanguageCode={activeLanguage?.code ?? null}
          isLanguageUpdating={isLanguageUpdating}
          languageOptions={languages.filter((language) => language.isActive)}
          onLanguageChange={handleLanguageChange}
          isCreator={user.role === "creator"}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
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
          activeLanguageCode={activeLanguage?.code ?? null}
          isLanguageUpdating={isLanguageUpdating}
          languageOptions={languages.filter((language) => language.isActive)}
          onLanguageChange={handleLanguageChange}
          isCreator={false}
          onActionStart={beginAction}
          onMenuClose={handleMenuClosed}
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
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingChatLanguage(null);
          }
        }}
        open={Boolean(pendingChatLanguage)}
      >
        <AlertDialogContent className="w-[90vw] max-w-sm gap-3 p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              {translate(
                "user_menu.language.chat_prompt.title",
                "Also change chat language?"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              {translate(
                "user_menu.language.chat_prompt.description",
                "Update the chat language to {language} as well?"
              ).replace("{language}", pendingChatLanguage?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 sm:space-x-2">
            <AlertDialogCancel
              className="h-8 px-3 text-xs"
              onClick={() => {
                setPendingChatLanguage(null);
              }}
            >
              {translate(
                "user_menu.language.chat_prompt.cancel",
                "No, keep chat language"
              )}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 px-3 text-xs"
              onClick={() => {
                if (!pendingChatLanguage) {
                  return;
                }
                const code = pendingChatLanguage.code;
                setPendingChatLanguage(null);
                handleChatLanguageConfirm(code);
              }}
            >
              {translate(
                "user_menu.language.chat_prompt.confirm",
                "Yes, update chat language"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      {overlayVisible ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="status"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-lg border bg-background px-5 py-4 text-center shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium">{overlayMessage}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
