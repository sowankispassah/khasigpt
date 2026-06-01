"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/account", label: "Account" },
  {
    badgeKey: "accountDeletionRequests" as const,
    href: "/admin/account-deletion",
    label: "Deletion Requests",
  },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/rag", label: "RAG" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/forum", label: "Forum" },
  { href: "/admin/characters", label: "Characters" },
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/logs", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/translations", label: "Translations" },
];

type AdminBadgeCounts = {
  accountDeletionRequests?: number;
};

export function AdminNav({
  className,
  initialBadgeCounts = {},
}: {
  className?: string;
  initialBadgeCounts?: AdminBadgeCounts;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const prefetchedRoutesRef = useRef(new Set<string>());
  const [badgeCounts, setBadgeCounts] =
    useState<AdminBadgeCounts>(initialBadgeCounts);
  const [mobileOpen, setMobileOpen] = useState(false);

  const prefetchRoute = useCallback(
    (href: string) => {
      if (prefetchedRoutesRef.current.has(href)) {
        return;
      }

      prefetchedRoutesRef.current.add(href);
      try {
        void router.prefetch(href);
      } catch {
        prefetchedRoutesRef.current.delete(href);
      }
    },
    [router]
  );

  useEffect(() => {
    const timeoutIds: number[] = [];
    ADMIN_LINKS.forEach((link, index) => {
      const timeoutId = window.setTimeout(() => {
        prefetchRoute(link.href);
      }, index * 60);
      timeoutIds.push(timeoutId);
    });

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [prefetchRoute]);

  useEffect(() => {
    let cancelled = false;

    async function refreshDeletionRequestCount() {
      try {
        const response = await fetch(
          "/api/admin/account-deletion/unviewed-count",
          {
            cache: "no-store",
            credentials: "same-origin",
          }
        );
        if (!(response.ok)) {
          return;
        }
        const body = (await response.json()) as { count?: unknown };
        const count =
          typeof body.count === "number" && Number.isFinite(body.count)
            ? Math.max(0, body.count)
            : 0;
        if (!cancelled) {
          setBadgeCounts((current) => ({
            ...current,
            accountDeletionRequests: count,
          }));
        }
      } catch (error) {
        console.warn(
          "[admin-nav] Failed to refresh account deletion badge count.",
          error
        );
      }
    }

    const handleCountUpdate = (event: Event) => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === "number" && Number.isFinite(count)) {
        setBadgeCounts((current) => ({
          ...current,
          accountDeletionRequests: Math.max(0, count),
        }));
        return;
      }
      void refreshDeletionRequestCount();
    };

    void refreshDeletionRequestCount();
    window.addEventListener(
      "admin:account-deletion-unviewed-count",
      handleCountUpdate
    );
    const intervalId = window.setInterval(refreshDeletionRequestCount, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener(
        "admin:account-deletion-unviewed-count",
        handleCountUpdate
      );
      window.clearInterval(intervalId);
    };
  }, []);

  const handleLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      if (href === pathname) {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      setMobileOpen(false);
      startGlobalProgress();
    },
    [pathname]
  );

  const getBadgeCount = useCallback(
    (link: (typeof ADMIN_LINKS)[number]) => {
      if (!("badgeKey" in link) || !link.badgeKey) {
        return 0;
      }
      return badgeCounts[link.badgeKey] ?? 0;
    },
    [badgeCounts]
  );

  return (
    <div className={cn("flex items-center", className)}>
      <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
        <SheetTrigger asChild>
          <Button
            aria-label="Open admin menu"
            className="md:hidden"
            size="icon"
            type="button"
            variant="outline"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[18rem] sm:max-w-[18rem]" side="left">
          <SheetHeader className="pr-8">
            <SheetTitle>Admin Menu</SheetTitle>
            <SheetDescription>
              Open any admin section from this menu.
            </SheetDescription>
          </SheetHeader>
          <nav className="mt-6 flex flex-col">
            {ADMIN_LINKS.map((link) => {
              const isActive = pathname === link.href;
              const badgeCount = getBadgeCount(link);
              return (
                <Link
                  className={cn(
                    "cursor-pointer rounded-md px-3 py-2 font-medium text-sm transition hover:bg-muted hover:text-primary",
                    isActive
                      ? "bg-muted text-primary"
                      : "text-muted-foreground"
                  )}
                  href={link.href}
                  key={link.href}
                  onClick={(event) => handleLinkClick(event, link.href)}
                  onFocus={() => prefetchRoute(link.href)}
                  onMouseEnter={() => prefetchRoute(link.href)}
                  onTouchStart={() => prefetchRoute(link.href)}
                  prefetch
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{link.label}</span>
                    {badgeCount > 0 ? <AdminNavBadge count={badgeCount} /> : null}
                  </span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <nav className="hidden flex-wrap items-center gap-3 font-medium text-sm md:flex">
        {ADMIN_LINKS.map((link) => {
          const isActive = pathname === link.href;
          const badgeCount = getBadgeCount(link);
          return (
            <Link
              className={cn(
                "cursor-pointer transition hover:text-primary hover:underline",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              href={link.href}
              key={link.href}
              onClick={(event) => handleLinkClick(event, link.href)}
              onFocus={() => prefetchRoute(link.href)}
              onMouseEnter={() => prefetchRoute(link.href)}
              onTouchStart={() => prefetchRoute(link.href)}
              prefetch
            >
              <span className="inline-flex items-center gap-1.5">
                <span>{link.label}</span>
                {badgeCount > 0 ? <AdminNavBadge count={badgeCount} /> : null}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AdminNavBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 font-semibold text-[11px] text-destructive-foreground leading-none"
      title={`${count} new account deletion ${
        count === 1 ? "request" : "requests"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
