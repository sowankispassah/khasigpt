import { AdminLiveUsers } from "@/components/admin-live-users";

export const dynamic = "force-dynamic";

export default function AdminLiveUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="font-semibold text-2xl">Live users</h2>
        <p className="text-muted-foreground text-sm">
          Track who is currently active, plus recent activity windows. Data is
          updated automatically every 30 seconds.
        </p>
      </header>
      <AdminLiveUsers />
    </div>
  );
}
