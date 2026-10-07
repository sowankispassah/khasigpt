import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { getChatStorageSummary } from "@/lib/admin/chat-storage";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { getActiveAdminSession } from "@/lib/security/admin-session";
import { StorageText, StorageView } from "./storage-view";

export const dynamic = "force-dynamic";

export default async function AdminStoragePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!await getActiveAdminSession()) redirect("/");
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 && raw <= 10000 ? raw : 1;
  const result = await adminQueryResult({ label: "storage", fallback: null, promise: getChatStorageSummary(page) });
  const data = result.ok ? result.data : null;
  return (
    <section className="flex flex-col gap-6">
      <AdminPageHeader
        actions={
          <Link
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 font-medium text-sm transition hover:bg-accent"
            data-nav
            href={`/admin/storage?page=${page}`}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            <StorageText name="refresh" />
          </Link>
        }
        description={<StorageText name="policy" />}
        navHref="/admin/storage"
        title={<StorageText name="title" />}
      />
      <StorageView data={data} page={page} />
    </section>
  );
}
