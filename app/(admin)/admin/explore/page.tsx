import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ExploreAdminManager } from "@/components/admin/explore-admin-manager";
import { ExploreProviderSettings } from "@/components/admin/explore-provider-settings";
import { listExploreCategories } from "@/lib/explore/service";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";

export default async function ExploreAdminPage() {
  const categories = await withTimeout(
    listExploreCategories({ admin: true }),
    8_000
  ).catch((error) => {
    console.error("[admin/explore] Initial load failed.", error);
    return null;
  });
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Configure discovery categories, subcategories, search behavior, location rules, icons, and ordering."
        navHref="/admin/explore"
        title="Nearby"
      />
      <ExploreProviderSettings />
      <ExploreAdminManager initialCategories={categories} />
    </div>
  );
}
