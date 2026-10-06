"use client";

import {
  BriefcaseBusiness,
  CircleDollarSign,
  Compass,
  Contact,
  Database,
  Flag,
  HardDrive,
  Languages,
  LayoutDashboard,
  Loader2,
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
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentType,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
} from "@/components/translation-edit-provider";

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
  | "users"
  | "accountDeletionRequests"
  | "contacts"
  | "reports"
  | "jobs"
  | "moderation"
  | "storage";

type AdminNavItem = {
  badgeKey?: AdminBadgeKey;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  labelKey?: string;
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
      { badgeKey: "users", href: "/admin/users", icon: Users, label: "Users" },
      { href: "/admin/account", icon: UserCog, label: "Account" },
      {
        badgeKey: "contacts",
        href: "/admin/contacts",
        icon: Contact,
        label: "Contacts",
        labelKey: "admin.nav.contacts",
      },
      {
        badgeKey: "reports",
        href: "/admin/reports",
        icon: Flag,
        label: "Reports",
        labelKey: "admin.nav.reports",
      },
      {
        badgeKey: "accountDeletionRequests",
        href: "/admin/account-deletion",
        icon: Trash2,
        label: "Deletion Requests",
        labelKey: "admin.nav.deletion_requests",
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
      { href: "/admin/explore", icon: Compass, label: "Explore Meghalaya" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/pricing", icon: CircleDollarSign, label: "Pricing" },
      { href: "/admin/settings", icon: Settings, label: "Settings" },
      { href: "/admin/translations", icon: Languages, label: "Translations" },
      { href: "/admin/logs", icon: ScrollText, label: "Audit Log" },
      { badgeKey: "storage", href: "/admin/storage", icon: HardDrive, label: "Chat storage", labelKey: "admin.storage.nav" },
      { href: "/admin/coupons", icon: Percent, label: "Coupons" },
    ],
  },
];

type AdminBadgeCounts = Partial<Record<AdminBadgeKey, number>>;

export function AdminNav({
  initialBadgeCounts = {},
}: {
  initialBadgeCounts?: AdminBadgeCounts;
}) {
  const pathname = usePathname();
  const { translate } = useTranslation();
  const { setOpenMobile } = useSidebar();
  const [badgeCounts, setBadgeCounts] =
    useState<AdminBadgeCounts>(initialBadgeCounts);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    async function refreshStorageAlerts() {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const timeout = window.setTimeout(() => current.abort(), 15_000);
      try {
        const response = await fetch("/api/admin/storage", { cache: "no-store", credentials: "same-origin", signal: current.signal });
        if (!response.ok) return;
        const body = await response.json() as { count?: unknown };
        if (!cancelled && !current.signal.aborted && typeof body.count === "number" && Number.isSafeInteger(body.count) && body.count >= 0) {
          const count = body.count;
          setBadgeCounts(previous => ({ ...previous, storage: count }));
        }
      } catch {
        // Preserve the last confirmed alert count; never block navigation.
      } finally { window.clearTimeout(timeout); }
    }
    const refresh = () => { void refreshStorageAlerts(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 120_000);
    refresh();
    return () => { cancelled = true; controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    async function refreshUsersCount() {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 15_000);
      try {
        const response = await fetch("/api/admin/users/unviewed-count", {
          cache: "no-store",
          credentials: "same-origin",
          signal: requestController.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { count?: unknown };
        if (
          !cancelled && !requestController.signal.aborted &&
          typeof body.count === "number" &&
          Number.isSafeInteger(body.count) && body.count >= 0
        ) {
          const count = body.count;
          setBadgeCounts((current) => ({ ...current, users: count }));
        }
      } catch {
        // This optional read must retain the last confirmed count on failure.
      } finally {
        window.clearTimeout(timeout);
      }
    }
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshUsersCount();
    };
    window.addEventListener("admin:users-unviewed-count", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    const interval = window.setInterval(refresh, 120_000);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("admin:users-unviewed-count", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

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

    window.addEventListener(
      "admin:account-deletion-unviewed-count",
      handleCountUpdate
    );
    void refreshDeletionRequestCount();
    const intervalId = window.setInterval(refreshDeletionRequestCount, 120_000);

    return () => {
      cancelled = true;
      window.removeEventListener(
        "admin:account-deletion-unviewed-count",
        handleCountUpdate
      );
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshContactCounts() {
      try {
        const response = await fetch("/api/admin/contact-messages/unread-counts", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { contacts?: unknown; reports?: unknown };
        if (
          typeof body.contacts !== "number" || !Number.isFinite(body.contacts) ||
          typeof body.reports !== "number" || !Number.isFinite(body.reports)
        ) {
          return;
        }
        const contacts = body.contacts;
        const reports = body.reports;
        if (!cancelled) {
          setBadgeCounts((current) => ({
            ...current,
            contacts: Math.max(0, contacts),
            reports: Math.max(0, reports),
          }));
        }
      } catch (error) {
        console.warn("[admin-nav] Failed to refresh contact and report badges.", error);
      }
    }

    const handleCountUpdate = () => void refreshContactCounts();
    window.addEventListener("admin:contact-unread-counts", handleCountUpdate);
    void refreshContactCounts();
    const intervalId = window.setInterval(refreshContactCounts, 120_000);

    return () => {
      cancelled = true;
      window.removeEventListener("admin:contact-unread-counts", handleCountUpdate);
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
            prefetch="auto"
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
                  const label = link.labelKey ? translate(link.labelKey, link.label) : link.label;
                  const badgeTitle = getBadgeTitle(
                    translate("admin.nav.unread_badge", "Unread in {section}: {count}"),
                    label,
                    badgeCount
                  );

                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "h-9 cursor-pointer has-[[data-pending=true]]:bg-primary/10 has-[[data-pending=true]]:text-primary",
                          isActive &&
                            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        )}
                        isActive={isActive}
                        tooltip={label}
                      >
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          aria-label={badgeCount > 0 ? `${label}. ${badgeTitle}` : undefined}
                          href={link.href}
                          onClick={(event) =>
                            handleLinkClick(event, link.href)
                          }
                          // Dynamic admin routes preload their loading boundary,
                          // keeping section data reads scoped to actual visits.
                          prefetch="auto"
                        >
                          <AdminNavLinkContent icon={Icon} link={link} />
                        </Link>
                      </SidebarMenuButton>
                      {badgeCount > 0 ? (
                        <>
                          <SidebarMenuBadge
                            className="h-5 min-w-5 rounded-full border border-red-700 bg-red-600 px-1 font-semibold text-white"
                            title={badgeTitle}
                          >
                            {formatBadgeCount(badgeCount)}
                          </SidebarMenuBadge>
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 hidden h-5 min-w-5 items-center justify-center rounded-full border border-red-700 bg-red-600 px-1 font-semibold text-[10px] text-white ring-2 ring-sidebar group-data-[collapsible=icon]:flex"
                            title={badgeTitle}
                          >{formatBadgeCount(badgeCount)}</span>
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

function AdminNavLinkContent({
  icon: Icon,
  link,
}: {
  icon: AdminNavItem["icon"];
  link: AdminNavItem;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        aria-busy={pending}
        className="relative size-4 shrink-0"
        data-pending={pending}
      >
        <Icon className={cn("size-4", pending && "invisible")} />
        {pending ? (
          <Loader2
            aria-hidden="true"
            className="absolute inset-0 size-4 animate-spin motion-reduce:animate-none"
          />
        ) : null}
      </span>
      <span>
        {link.labelKey ? (
          <EditableTranslation
            defaultText={link.label}
            description={`${link.label} admin navigation label.`}
            translationKey={link.labelKey}
          />
        ) : (
          link.label
        )}
      </span>
    </>
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

function getBadgeTitle(template: string, label: string, count: number) {
  return template
    .replace("{count}", String(count))
    .replace("{section}", label.toLowerCase());
}
