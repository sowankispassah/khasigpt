"use client";

import {
  BriefcaseBusiness,
  Contact,
  Database,
  Languages,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Percent,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ComponentType,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

type AdminBadgeKey =
  | "accountDeletionRequests"
  | "contacts"
  | "jobs"
  | "moderation";

type AdminNavItem = {
  badgeKey?: AdminBadgeKey;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

type AdminNavGroup = {
  items: AdminNavItem[];
  label: string;
};

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Dashboard",
    items: [{ href: "/admin", icon: LayoutDashboard, label: "Overview" }],
  },
  {
    label: "User Management",
    items: [
      { href: "/admin/users", icon: Users, label: "Users" },
      { href: "/admin/account", icon: UserCog, label: "Account" },
      {
        badgeKey: "contacts",
        href: "/admin/contacts",
        icon: Contact,
        label: "Contacts",
      },
      {
        badgeKey: "accountDeletionRequests",
        href: "/admin/account-deletion",
        icon: Trash2,
        label: "Deletion Requests",
      },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/chats", icon: MessagesSquare, label: "Chats" },
      { href: "/admin/forum", icon: MessageSquare, label: "Forum" },
      { href: "/admin/characters", icon: ShieldCheck, label: "Characters" },
      {
        badgeKey: "jobs",
        href: "/admin/jobs",
        icon: BriefcaseBusiness,
        label: "Jobs",
      },
      { href: "/admin/rag", icon: Database, label: "RAG" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/settings", icon: Settings, label: "Settings" },
      { href: "/admin/translations", icon: Languages, label: "Translations" },
      { href: "/admin/logs", icon: ScrollText, label: "Audit Log" },
      { href: "/admin/coupons", icon: Percent, label: "Coupons" },
    ],
  },
];

const ADMIN_LINKS = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

type AdminBadgeCounts = Partial<Record<AdminBadgeKey, number>>;

export function AdminNav({
  initialBadgeCounts = {},
}: {
  initialBadgeCounts?: AdminBadgeCounts;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const prefetchedRoutesRef = useRef(new Set<string>());
  const [badgeCounts, setBadgeCounts] =
    useState<AdminBadgeCounts>(initialBadgeCounts);

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
        if (!response.ok) {
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
      if (isActiveAdminRoute(pathname, href)) {
        event.preventDefault();
        setOpenMobile(false);
        return;
      }
      setOpenMobile(false);
      startGlobalProgress();
    },
    [pathname, setOpenMobile]
  );

  const getBadgeCount = useCallback(
    (link: AdminNavItem) => {
      if (!link.badgeKey) {
        return 0;
      }
      return badgeCounts[link.badgeKey] ?? 0;
    },
    [badgeCounts]
  );

  return (
    <Sidebar
      className="border-r bg-sidebar"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarHeader className="border-b">
        <div className="flex h-12 items-center px-1">
          <Link
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-sidebar-foreground text-sm outline-none transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            href="/admin"
            onClick={(event) => handleLinkClick(event, "/admin")}
            onFocus={() => prefetchRoute("/admin")}
            onMouseEnter={() => prefetchRoute("/admin")}
            prefetch
          >
            <LayoutDashboard className="size-5 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">
              Admin Console
            </span>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        {ADMIN_NAV_GROUPS.map((group, index) => (
          <SidebarGroup className="py-2" key={group.label}>
            {index > 0 ? <SidebarSeparator className="-mt-2 mb-2" /> : null}
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((link) => {
                  const isActive = isActiveAdminRoute(pathname, link.href);
                  const badgeCount = getBadgeCount(link);
                  const Icon = link.icon;

                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "h-9 cursor-pointer",
                          isActive &&
                            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        )}
                        isActive={isActive}
                        tooltip={link.label}
                      >
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          href={link.href}
                          onClick={(event) =>
                            handleLinkClick(event, link.href)
                          }
                          onFocus={() => prefetchRoute(link.href)}
                          onMouseEnter={() => prefetchRoute(link.href)}
                          onTouchStart={() => prefetchRoute(link.href)}
                          prefetch
                        >
                          <Icon className="size-4" />
                          <span>{link.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badgeCount > 0 ? (
                        <>
                          <SidebarMenuBadge
                            className="bg-destructive px-1.5 font-semibold text-destructive-foreground"
                            title={getBadgeTitle(link.label, badgeCount)}
                          >
                            {formatBadgeCount(badgeCount)}
                          </SidebarMenuBadge>
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 right-1 hidden size-2.5 rounded-full bg-destructive ring-2 ring-sidebar group-data-[collapsible=icon]:block"
                            title={getBadgeTitle(link.label, badgeCount)}
                          />
                        </>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function isActiveAdminRoute(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : count;
}

function getBadgeTitle(label: string, count: number) {
  return `${count} pending ${label.toLowerCase()} ${
    count === 1 ? "item" : "items"
  }`;
}
