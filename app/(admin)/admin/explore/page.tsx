import { ExploreAdminManager } from "@/components/admin/explore-admin-manager";
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
      <div>
        <h1 className="font-semibold text-2xl">Explore Meghalaya</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Configure discovery categories, subcategories, search behavior, location rules, icons, and ordering.
        </p>
      </div>
      <ExploreAdminManager initialCategories={categories} />
    </div>
  );
}
