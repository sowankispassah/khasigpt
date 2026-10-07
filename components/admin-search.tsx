"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "@/components/language-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ADMIN_NAV_GROUPS, type AdminNavItem } from "@/lib/admin/navigation";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

const APPLE_PLATFORM_REGEX = /(Mac|iPhone|iPod|iPad)/i;

type PaletteEntry = AdminNavItem & { group: string };

const PALETTE_ENTRIES: PaletteEntry[] = ADMIN_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label }))
);

function matches(entry: PaletteEntry, query: string) {
  return (
    entry.label.toLowerCase().includes(query) ||
    entry.description.toLowerCase().includes(query) ||
    entry.group.toLowerCase().includes(query) ||
    entry.keywords.some((keyword) => keyword.includes(query))
  );
}

/** Keyboard-first jump to any admin section (Ctrl/Cmd+K). */
export function AdminSearch() {
  const router = useRouter();
  const { translate } = useTranslation();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(APPLE_PLATFORM_REGEX.test(navigator.platform));
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? PALETTE_ENTRIES.filter((entry) => matches(entry, normalized))
      : PALETTE_ENTRIES;
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQuery("");
    }
  };

  const navigate = (href: string) => {
    handleOpenChange(false);
    startGlobalProgress();
    router.push(href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length ? (index - 1 + results.length) % results.length : 0
      );
    } else if (event.key === "Enter") {
      const entry = results[activeIndex];
      if (entry) {
        event.preventDefault();
        navigate(entry.href);
      }
    }
  };

  const searchLabel = translate("admin.search.open", "Search admin");
  let lastGroup: string | null = null;

  return (
    <>
      <button
        aria-label={searchLabel}
        className="hidden h-9 w-64 cursor-pointer items-center gap-2 rounded-lg border bg-muted/40 px-3 text-muted-foreground text-sm transition hover:bg-muted md:flex"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">
          {translate("admin.search.placeholder_short", "Search admin…")}
        </span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <button
        aria-label={searchLabel}
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted md:hidden"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Search className="size-4" />
      </button>

      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%] sm:rounded-xl">
          <DialogTitle className="sr-only">{searchLabel}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate(
              "admin.search.description",
              "Type to filter admin sections, then press Enter to open one."
            )}
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-activedescendant={
                results[activeIndex] ? `${listId}-${activeIndex}` : undefined
              }
              aria-controls={listId}
              aria-expanded="true"
              autoFocus
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={translate(
                "admin.search.placeholder",
                "Search pages, settings, or tools..."
              )}
              role="combobox"
              value={query}
            />
          </div>
          <div
            className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
            id={listId}
            ref={listRef}
            role="listbox"
          >
            {results.length === 0 ? (
              <p className="px-4 py-10 text-center text-muted-foreground text-sm">
                {translate(
                  "admin.search.no_results",
                  "No sections match that search."
                )}
              </p>
            ) : (
              results.map((entry, index) => {
                const Icon = entry.icon;
                const showGroup = entry.group !== lastGroup;
                lastGroup = entry.group;
                const label = entry.labelKey
                  ? translate(entry.labelKey, entry.label)
                  : entry.label;
                return (
                  <div key={entry.href}>
                    {showGroup ? (
                      <p className="px-2 pt-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                        {entry.group}
                      </p>
                    ) : null}
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: options are driven from the combobox input's arrow and Enter keys. */}
                    <div
                      aria-selected={index === activeIndex}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                        index === activeIndex && "bg-primary/10"
                      )}
                      data-index={index}
                      id={`${listId}-${index}`}
                      onClick={() => navigate(entry.href)}
                      onMouseMove={() => setActiveIndex(index)}
                      role="option"
                      tabIndex={-1}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
                          index === activeIndex && "border-primary/30 text-primary"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-sm">{label}</span>
                        <span className="block truncate text-muted-foreground text-xs">
                          {entry.description}
                        </span>
                      </span>
                      {index === activeIndex ? (
                        <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" />
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="font-mono">↑↓</kbd>{" "}
              {translate("admin.search.hint_navigate", "to navigate")}
            </span>
            <span>
              <kbd className="font-mono">↵</kbd>{" "}
              {translate("admin.search.hint_open", "to open")}
            </span>
            <span>
              <kbd className="font-mono">esc</kbd>{" "}
              {translate("admin.search.hint_close", "to close")}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
