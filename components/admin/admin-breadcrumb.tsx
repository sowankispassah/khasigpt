"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/language-provider";
import { findAdminNavEntry } from "@/lib/admin/navigation";
import { startGlobalProgress } from "@/lib/ui/global-progress";

/** Shell breadcrumb; each page owns its own <h1> through AdminPageHeader. */
export function AdminBreadcrumb() {
  const pathname = usePathname();
  const { translate } = useTranslation();
  const entry = findAdminNavEntry(pathname);
  const label = entry
    ? entry.item.labelKey
      ? translate(entry.item.labelKey, entry.item.label)
      : entry.item.label
    : null;
  const isNested = Boolean(entry && pathname !== entry.item.href);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="hidden shrink-0 text-muted-foreground sm:block">
          {entry?.group.label ?? "Admin"}
        </li>
        {label ? (
          <>
            <li aria-hidden="true" className="hidden text-muted-foreground/60 sm:block">
              <ChevronRight className="size-3.5" />
            </li>
            <li className="min-w-0 truncate">
              {isNested && entry ? (
                <Link
                  className="cursor-pointer text-muted-foreground transition hover:text-foreground"
                  href={entry.item.href}
                  onClick={() => startGlobalProgress()}
                >
                  {label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium">
                  {label}
                </span>
              )}
            </li>
            {isNested ? (
              <>
                <li aria-hidden="true" className="text-muted-foreground/60">
                  <ChevronRight className="size-3.5" />
                </li>
                <li aria-current="page" className="truncate font-medium">
                  {translate("admin.shell.breadcrumb_details", "Details")}
                </li>
              </>
            ) : null}
          </>
        ) : null}
      </ol>
    </nav>
  );
}
