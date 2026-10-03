import { AdminLiveUsers } from "@/components/admin-live-users";
import { EditableTranslation } from "@/components/translation-edit-provider";

export const dynamic = "force-dynamic";

export default function AdminLiveUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h2 className="font-semibold text-2xl">
          <EditableTranslation
            defaultText="Live users"
            description="Title of the admin live users page."
            translationKey="admin.live_users.page.title"
          />
        </h2>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Track who is currently online and review recent activity with one time-range filter. Data refreshes automatically every 30 seconds."
            description="Description below the admin live users page title."
            translationKey="admin.live_users.page.description"
          />
        </p>
      </header>
      <AdminLiveUsers />
    </div>
  );
}
