import { listAuditLog } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage() {
  const auditEntries = await listAuditLog({ limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold">Audit log</h2>
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
              <th className="py-3 text-left">Target</th>
              <th className="py-3 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {auditEntries.map((entry) => (
              <tr key={entry.id} className="border-t text-sm">
                <td className="py-3 text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="py-3 font-medium">{entry.action}</td>
                <td className="py-3 text-xs">{entry.actorId}</td>
                <td className="py-3 text-xs text-muted-foreground">
                  {JSON.stringify(entry.target)}
                </td>
                <td className="py-3 text-xs text-muted-foreground">
                  {entry.metadata ? JSON.stringify(entry.metadata) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
