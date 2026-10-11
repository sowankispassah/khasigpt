import {
  Activity,
  BriefcaseBusiness,
  CircleDollarSign,
  Compass,
  Contact,
  Database,
  Flag,
  HardDrive,
  Languages,
  LayoutDashboard,
  type LucideIcon,
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
import type { AdminNavBadgeKey } from "@/components/admin/use-admin-nav-counts";

export type AdminNavItem = {
  badgeKey?: AdminNavBadgeKey;
  description: string;
  href: string;
  icon: LucideIcon;
  keywords: string[];
  label: string;
  labelKey?: string;
};

export type AdminNavGroup = {
  items: AdminNavItem[];
  label: string;
};

// Single source for the sidebar, the command palette and page breadcrumbs.
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Dashboard",
    items: [
      {
        description: "Key metrics, trends and recent activity.",
        href: "/admin",
        icon: LayoutDashboard,
        keywords: ["dashboard", "home", "metrics", "overview"],
        label: "Overview",
      },
      {
        description: "Who is online now, with recent session activity.",
        href: "/admin/live-users",
        icon: Activity,
        keywords: ["presence", "active", "online", "sessions"],
        label: "Live users",
      },
    ],
  },
  {
    label: "User Management",
    items: [
      {
        badgeKey: "users",
        description: "Review signups, roles, credits and access.",
        href: "/admin/users",
        icon: Users,
        keywords: ["members", "roles", "accounts", "credits"],
        label: "Users",
      },
      {
        description: "Per-chat profit, API costs and transactions.",
        href: "/admin/account",
        icon: UserCog,
        keywords: ["profit", "revenue", "transactions", "costs", "recharges"],
        label: "Account",
      },
      {
        badgeKey: "contacts",
        description: "Support messages submitted through the contact form.",
        href: "/admin/contacts",
        icon: Contact,
        keywords: ["support", "contact", "inquiry", "messages"],
        label: "Contacts",
        labelKey: "admin.nav.contacts",
      },
      {
        badgeKey: "reports",
        description: "AI response feedback and safety reports.",
        href: "/admin/reports",
        icon: Flag,
        keywords: ["reports", "feedback", "safety"],
        label: "Reports",
        labelKey: "admin.nav.reports",
      },
      {
        badgeKey: "accountDeletionRequests",
        description: "Pending account deletion requests.",
        href: "/admin/account-deletion",
        icon: Trash2,
        keywords: ["deletion", "privacy", "removal"],
        label: "Deletion Requests",
        labelKey: "admin.nav.deletion_requests",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        description: "Chat activity across the platform.",
        href: "/admin/chats",
        icon: MessagesSquare,
        keywords: ["conversations", "messages", "history"],
        label: "Chats",
      },
      {
        description: "Moderate community threads and posts.",
        href: "/admin/forum",
        icon: MessageSquare,
        keywords: ["forum", "moderation", "threads", "community"],
        label: "Forum",
      },
      {
        description: "Character profiles and reference images.",
        href: "/admin/characters",
        icon: ShieldCheck,
        keywords: ["characters", "personas", "profiles"],
        label: "Characters",
      },
      {
        description: "Job listings, sources and scraping.",
        href: "/admin/jobs",
        icon: BriefcaseBusiness,
        keywords: ["jobs", "scrape", "listings", "career"],
        label: "Jobs",
      },
      {
        description: "Retrieval knowledge and index rebuilds.",
        href: "/admin/rag",
        icon: Database,
        keywords: ["rag", "knowledge", "retrieval", "embeddings"],
        label: "RAG",
      },
      {
        description: "Nearby categories, providers and photo cache.",
        href: "/admin/explore",
        icon: Compass,
        keywords: ["nearby", "explore", "places", "categories"],
        label: "Nearby",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        description: "Plans, model pricing, credits and margins.",
        href: "/admin/pricing",
        icon: CircleDollarSign,
        keywords: ["pricing", "plans", "credits", "margins", "models"],
        label: "Pricing",
      },
      {
        description: "Referral coupons and discount campaigns.",
        href: "/admin/coupons",
        icon: Percent,
        keywords: ["discounts", "referrals", "campaigns", "creators"],
        label: "Coupons",
      },
      {
        description: "Site access, features, models and languages.",
        href: "/admin/settings",
        icon: Settings,
        keywords: ["settings", "features", "maintenance", "launch", "models"],
        label: "Settings",
      },
      {
        description: "Multilingual copy for every page.",
        href: "/admin/translations",
        icon: Languages,
        keywords: ["languages", "i18n", "copy", "khasi"],
        label: "Translations",
      },
      {
        description: "Configuration changes and security events.",
        href: "/admin/logs",
        icon: ScrollText,
        keywords: ["audit", "history", "events", "security"],
        label: "Audit Log",
      },
      {
        badgeKey: "storage",
        description: "Chat file storage usage and alerts.",
        href: "/admin/storage",
        icon: HardDrive,
        keywords: ["storage", "files", "uploads", "quota"],
        label: "Chat storage",
        labelKey: "admin.storage.nav",
      },
    ],
  },
];

export function isActiveAdminRoute(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav entry (and its group) that owns `pathname`, if any. */
export function findAdminNavEntry(pathname: string) {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (isActiveAdminRoute(pathname, item.href)) {
        return { group, item };
      }
    }
  }
  return null;
}
