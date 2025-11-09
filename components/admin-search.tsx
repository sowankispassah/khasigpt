"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type AdminSearchEntry = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: string;
  keywords: string[];
};

const ADMIN_SEARCH_ENTRIES: AdminSearchEntry[] = [
  {
    id: "overview",
    title: "Admin Overview",
    description: "Usage metrics, billing health, and quick stats.",
    href: "/admin",
    category: "Dashboard",
    keywords: ["dashboard", "home", "metrics", "health"],
  },
  {
    id: "account",
    title: "Admin Account",
    description: "Manage your admin profile and credentials.",
    href: "/admin/account",
    category: "Account",
    keywords: ["profile", "admin account", "details"],
  },
  {
    id: "users",
    title: "Users",
    description: "Review user signups, roles, and access.",
    href: "/admin/users",
    category: "People",
    keywords: ["members", "roles", "accounts"],
  },
  {
    id: "chats",
    title: "Chats",
    description: "Inspect chat activity across the system.",
    href: "/admin/chats",
    category: "Data",
    keywords: ["conversations", "messages", "history"],
  },
  {
    id: "contacts",
    title: "Contact Messages",
    description: "Support inquiries submitted via the contact form.",
    href: "/admin/contacts",
    category: "Support",
    keywords: ["support", "contact", "feedback"],
  },
  {
    id: "logs",
    title: "Audit Log",
    description: "Track configuration changes and security-sensitive events.",
    href: "/admin/logs",
    category: "Security",
    keywords: ["audit", "history", "events"],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Configure pricing, models, and platform behaviour.",
    href: "/admin/settings",
    category: "Configuration",
    keywords: ["pricing", "models", "limits", "settings"],
  },
  {
    id: "translations",
    title: "Translations",
    description: "Manage multilingual copy for every public page.",
    href: "/admin/translations",
    category: "Localization",
    keywords: ["languages", "i18n", "forum", "home"],
  },
];

export function AdminSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return ADMIN_SEARCH_ENTRIES;
    }
    return ADMIN_SEARCH_ENTRIES.filter((entry) => {
      return (
        entry.title.toLowerCase().includes(normalized) ||
        entry.description.toLowerCase().includes(normalized) ||
        entry.keywords.some((keyword) =>
          keyword.toLowerCase().includes(normalized)
        )
      );
    });
  }, [query]);

  const handleNavigate = (href: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(href);
  };

  const isMac =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

  return (
    <>
      <Button
        aria-label="Search admin content"
        className="hidden items-center gap-2 md:flex"
        onClick={() => setIsOpen(true)}
        variant="outline"
      >
        <Search className="h-4 w-4" />
        <span>Search</span>
        <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isMac ? "⌘ K" : "Ctrl K"}
        </span>
      </Button>
      <Button
        aria-label="Search admin content"
        className="flex items-center gap-2 md:hidden"
        onClick={() => setIsOpen(true)}
        size="icon"
        variant="outline"
      >
        <Search className="h-4 w-4" />
      </Button>

      <Sheet onOpenChange={setIsOpen} open={isOpen}>
        <SheetContent
          className="mx-auto h-auto w-full max-w-3xl rounded-b-3xl border-x-0 border-b bg-background px-0 pb-6 pt-4 shadow-2xl sm:px-0"
          side="top"
        >
          <SheetHeader className="px-6">
            <SheetTitle>Search admin tools</SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4">
            <Input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, settings, or tools..."
              value={query}
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {filteredEntries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results for “{query.trim()}”. Try another search term.
              </p>
            ) : (
              <ul className="space-y-1">
                {filteredEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      className={cn(
                        "w-full rounded-xl border border-transparent px-4 py-3 text-left transition",
                        "hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      )}
                      onClick={() => handleNavigate(entry.href)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{entry.title}</p>
                          <p className="text-muted-foreground text-xs">
                            {entry.description}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {entry.category}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
