"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/account", label: "Account" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/rag", label: "RAG" },
  { href: "/admin/characters", label: "Characters" },
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/logs", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/translations", label: "Translations" },
];

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const startProgress = useCallback(() => {
    clearTimers();
    setIsNavigating(true);
    setProgress(12);
    const timers = [
      setTimeout(() => setProgress(40), 120),
      setTimeout(() => setProgress(70), 260),
      setTimeout(() => setProgress(90), 520),
      setTimeout(() => {
        clearTimers();
        setIsNavigating(false);
        setProgress(0);
      }, 12000),
    ];
    timersRef.current = timers;
  }, [clearTimers]);

  useEffect(() => {
    if (!pathname) {
      return;
    }
    clearTimers();
    setIsNavigating(false);
    setProgress(0);
  }, [clearTimers, pathname]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

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
        setIsNavigating(false);
        setProgress(0);
        return;
      }
      event.preventDefault();
      startProgress();
      router.push(href);
    },
    [pathname, router, startProgress]
  );

  return (
    <>
      {isNavigating ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <nav
        className={cn(
          "flex flex-wrap items-center gap-3 font-medium text-sm",
          className
        )}
      >
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
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
