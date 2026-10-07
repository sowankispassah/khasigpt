"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { type MouseEvent, useCallback } from "react";
import {
  type AdminNavBadgeCounts,
  useAdminNavCounts,
} from "@/components/admin/use-admin-nav-counts";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ADMIN_NAV_GROUPS,
  type AdminNavItem,
  isActiveAdminRoute,
} from "@/lib/admin/navigation";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

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

  return (
    <Sidebar className="border-r" collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-sidebar-border/70 border-b">
        <Link
          className="flex h-12 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 outline-none transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          href="/admin"
          onClick={(event) => handleLinkClick(event, "/admin")}
          prefetch="auto"
        >
          {/* Light tile keeps the dark logo visible on the dark sidebar. */}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-sidebar-border">
            <Image
              alt=""
              className="size-6"
              height={24}
              src="/images/khasigptlogo.png"
              width={24}
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold text-sidebar-foreground text-sm">
              KhasiGPT
            </span>
            <span className="truncate text-sidebar-foreground/60 text-xs">
              <EditableTranslation
                defaultText="Admin console"
                description="Subtitle under the brand name in the admin sidebar."
                translationKey="admin.shell.subtitle"
              />
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {ADMIN_NAV_GROUPS.map((group) => (
          <SidebarGroup className="py-1.5" key={group.label}>
            <SidebarGroupLabel className="font-medium text-[11px] text-sidebar-foreground/50 uppercase tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((link) => {
                  const isActive = isActiveAdminRoute(pathname, link.href);
                  const badgeCount = link.badgeKey
                    ? (badgeCounts[link.badgeKey] ?? 0)
                    : 0;
                  const label = link.labelKey
                    ? translate(link.labelKey, link.label)
                    : link.label;
                  const badgeTitle = getBadgeTitle(
                    translate(
                      "admin.nav.unread_badge",
                      "Unread in {section}: {count}"
                    ),
                    label,
                    badgeCount
                  );

                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "h-9 cursor-pointer text-sidebar-foreground/80 has-[[data-pending=true]]:bg-primary/10 has-[[data-pending=true]]:text-primary",
                          isActive &&
                            "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary"
                        )}
                        isActive={isActive}
                        tooltip={label}
                      >
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          aria-label={
                            badgeCount > 0 ? `${label}. ${badgeTitle}` : undefined
                          }
                          href={link.href}
                          onClick={(event) => handleLinkClick(event, link.href)}
                          // Dynamic admin routes preload their loading boundary,
                          // keeping section data reads scoped to actual visits.
                          prefetch="auto"
                        >
                          <AdminNavLinkContent link={link} />
                        </Link>
                      </SidebarMenuButton>
                      {badgeCount > 0 ? (
                        <>
                          <SidebarMenuBadge
                            className="h-5 min-w-5 rounded-full bg-destructive px-1.5 font-semibold text-[11px] text-white tabular-nums"
                            title={badgeTitle}
                          >
                            {formatBadgeCount(badgeCount)}
                          </SidebarMenuBadge>
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 hidden h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-semibold text-[10px] text-white ring-2 ring-sidebar group-data-[collapsible=icon]:flex"
                            title={badgeTitle}
                          >
                            {formatBadgeCount(badgeCount)}
                          </span>
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

      <SidebarFooter className="border-sidebar-border/70 border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-9 cursor-pointer text-sidebar-foreground/70"
              tooltip={translate("admin.shell.back_to_app", "Back to app")}
            >
              <Link href="/chat" onClick={() => startGlobalProgress()}>
                <ArrowLeft className="size-4" />
                <span>
                  <EditableTranslation
                    defaultText="Back to app"
                    description="Admin sidebar footer link that returns to the main chat app."
                    translationKey="admin.shell.back_to_app"
                  />
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AdminNavLinkContent({ link }: { link: AdminNavItem }) {
  const { pending } = useLinkStatus();
  const Icon = link.icon;

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

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : count;
}

function getBadgeTitle(template: string, label: string, count: number) {
  return template
    .replace("{count}", String(count))
    .replace("{section}", label.toLowerCase());
}
