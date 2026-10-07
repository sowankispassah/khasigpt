import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AdminLiveUsers } from "@/components/admin-live-users";
import { EditableTranslation } from "@/components/translation-edit-provider";

export const dynamic = "force-dynamic";

export default function AdminLiveUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description={
          <EditableTranslation
            defaultText="Track who is currently online and review recent activity with one time-range filter. Data refreshes automatically every 30 seconds."
            description="Description below the admin live users page title."
            translationKey="admin.live_users.page.description"
          />
        }
        navHref="/admin/live-users"
        title={
          <EditableTranslation
            defaultText="Live users"
            description="Title of the admin live users page."
            translationKey="admin.live_users.page.title"
          />
        }
      />
      <AdminLiveUsers />
    </div>
  );
}
