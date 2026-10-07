import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { StorageInventoryButton } from "@/components/admin/storage-inventory-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { getChatStorageSummary } from "@/lib/admin/chat-storage";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { getActiveAdminSession } from "@/lib/security/admin-session";
import { STORAGE_COPY } from "@/lib/uploads/storage-copy";
import { STORAGE_ALERT_BYTES } from "@/lib/uploads/storage-lifecycle";

export const dynamic = "force-dynamic";
function Text({ name, values }: { name: keyof typeof STORAGE_COPY; values?: Record<string, string | number> }) {
  return <EditableTranslation {...STORAGE_COPY[name]} values={values} />;
}
function size(value: string | number) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? `${(bytes / 1024 ** 2).toFixed(2)} MiB` : "—";
}

export default async function AdminStoragePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!await getActiveAdminSession()) redirect("/");
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 && raw <= 10000 ? raw : 1;
  const result = await adminQueryResult({ label: "storage", fallback: null, promise: getChatStorageSummary(page) });
  const data = result.ok ? result.data : null;
  const run = data?.maintenance?.lastResult;
  const runData = run && typeof run === "object" && "deleted" in run && "failed" in run && "deferred" in run && "dryRun" in run && typeof run.dryRun === "boolean" && [run.deleted, run.failed, run.deferred].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) ? run : null;
  const date = data?.maintenance?.lastRunAt;
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  return <section className="flex flex-col gap-5">
    <AdminPageHeader
      actions={<Link className="inline-flex h-8 cursor-pointer items-center rounded-md border bg-background px-3 font-medium text-sm hover:bg-accent" data-nav href={`/admin/storage?page=${page}`}><Text name="refresh" /></Link>}
      navHref="/admin/storage"
      title={<Text name="title" />}
    />
    <p className="text-muted-foreground text-sm"><Text name="policy" /></p>
    <p className="text-muted-foreground text-sm"><Text name="restore" /></p>
    <StorageInventoryButton />
    {!data?.totals ? <p role="alert"><Text name="unavailable" /></p> : <>
      <p><Text name="total" values={{ bytes: size(data.totals.bytes), files: data.totals.files }} /></p>
      <p role={data.totals.alerts ? "alert" : undefined} className={data.totals.alerts ? "rounded border border-amber-500 p-3" : "text-muted-foreground"}><Text name="alert" values={{ limit: "1 GiB", count: data.totals.alerts }} /></p>
      {!!data.pending?.failed && <p role="alert" className="text-destructive"><Text name="failed" values={{ count: data.pending.failed }} /></p>}
      {!data.maintenance?.inventoryCompletedAt && <p><Text name="inventory" /></p>}
      {!!data.pending?.unknown && <p><Text name="unknown" values={{ count: data.pending.unknown }} /></p>}
      <p className="text-sm"><Text name="lastRun" values={{ date: parsedDate instanceof Date && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : "—" }} />{!date && <Text name="notRun" />}</p>
      {runData && "ok" in runData && runData.ok === false && <p role="alert"><Text name="runFailed" /></p>}
      {runData && <p className="text-sm"><Text name="runResult" values={{ deleted: Number(runData.deleted), failed: Number(runData.failed), deferred: Number(runData.deferred) }} /> <Text name="dryRun" /> <Text name={runData.dryRun ? "yes" : "no"} /></p>}
      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr><th className="p-3"><Text name="account" /></th><th className="p-3"><Text name="bytes" /></th><th className="p-3"><Text name="files" /></th><th className="p-3"><Text name="review" /></th></tr></thead><tbody>
        {data.accounts.map(account => <tr className="border-t" key={account.userId}><td className="p-3 font-mono">{account.userId}</td><td className="p-3">{size(account.bytes)}</td><td className="p-3">{account.files}</td><td className="p-3">{Number(account.bytes) >= STORAGE_ALERT_BYTES ? <Text name="yes" /> : <Text name="no" />}</td></tr>)}
        {!data.accounts.length && <tr><td className="p-3" colSpan={4}><Text name="empty" /></td></tr>}
      </tbody></table></div>
      <nav className="flex gap-5">{page > 1 && <Link className="cursor-pointer underline" data-nav href={`/admin/storage?page=${page - 1}`}><Text name="previous" /></Link>}{data.hasNext && <Link className="cursor-pointer underline" data-nav href={`/admin/storage?page=${page + 1}`}><Text name="next" /></Link>}</nav>
    </>}
  </section>;
}
