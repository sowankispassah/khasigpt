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
} from "react";
import {
  type AdminNavBadgeCounts,
  type AdminNavBadgeKey,
  useAdminNavCounts,
} from "@/components/admin/use-admin-nav-counts";
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

type AdminNavItem = {
  badgeKey?: AdminNavBadgeKey;
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
      { href: "/admin/jobs", icon: BriefcaseBusiness, label: "Jobs" },
      { href: "/admin/rag", icon: Database, label: "RAG" },
      { href: "/admin/explore", icon: Compass, label: "Nearby" },
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

export function AdminNav({
  initialBadgeCounts = {},
}: {
  initialBadgeCounts?: AdminNavBadgeCounts;
}) {
  const pathname = usePathname();
  const { translate } = useTranslation();
  const { setOpenMobile } = useSidebar();
  const badgeCounts = useAdminNavCounts(initialBadgeCounts);

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
