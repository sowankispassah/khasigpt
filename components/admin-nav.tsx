"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  useCallback,
  useEffect,
} from "react";

import { startGlobalProgress } from "@/lib/ui/global-progress";
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

  useEffect(() => {
    for (const link of ADMIN_LINKS) {
      router.prefetch(link.href);
    }
  }, [router]);

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
        return;
      }
      event.preventDefault();
      startGlobalProgress();
      router.push(href);
    },
    [pathname, router]
  );

  return (
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
            prefetch
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
