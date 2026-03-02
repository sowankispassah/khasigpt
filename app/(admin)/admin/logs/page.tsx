import { formatDistanceToNow } from "date-fns";

import { listAuditLog } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage() {
  const auditEntries = await listAuditLog({ limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-semibold text-xl">Audit log</h2>
        <p className="text-muted-foreground text-sm">
          Every administrative action is recorded for compliance.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-3 text-left">Timestamp</th>
              <th className="py-3 text-left">Action</th>
              <th className="py-3 text-left">Actor</th>
              <th className="py-3 text-left">IP</th>
              <th className="py-3 text-left">Device</th>
              <th className="py-3 text-left">User Agent</th>
              <th className="py-3 text-left">Target</th>
              <th className="py-3 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {auditEntries.length === 0 ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={8}>
                  No audit entries available yet.
                </td>
              </tr>
            ) : (
              auditEntries.map((entry) => (
                <tr className="border-t align-top text-sm" key={entry.id}>
                  <td className="py-3 text-muted-foreground text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                    <div className="text-[11px] text-muted-foreground/80">
                      {formatDistanceToNow(new Date(entry.createdAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </td>
                  <td className="py-3 font-medium">{entry.action}</td>
                  <td className="py-3 text-xs">{entry.actorId}</td>
                  <td className="py-3 text-xs">{entry.ipAddress ?? "—"}</td>
                  <td className="py-3 text-xs capitalize">
                    {entry.device ?? "—"}
                  </td>
                  <td
                    className="py-3 text-xs"
                    title={entry.userAgent ?? undefined}
                  >
                    <span className="line-clamp-2 max-w-xs break-words">
                      {entry.userAgent ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground text-xs">
                    {JSON.stringify(entry.target)}
                  </td>
                  <td className="py-3 text-muted-foreground text-xs">
                    {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
