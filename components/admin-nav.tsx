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
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/rag", label: "RAG" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/characters", label: "Characters" },
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/logs", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/translations", label: "Translations" },
];

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const prefetchedRoutesRef = useRef(new Set<string>());
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
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <nav className="hidden flex-wrap items-center gap-3 font-medium text-sm md:flex">
        {ADMIN_LINKS.map((link) => {
          const isActive = pathname === link.href;
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
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
