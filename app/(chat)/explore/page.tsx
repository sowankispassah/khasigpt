import { notFound, redirect } from "next/navigation";
import { ExplorePageClient } from "@/components/explore/explore-page-client";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { listExploreCategories } from "@/lib/explore/service";
import { withTimeout } from "@/lib/utils/async";
import { getChatRouteSession } from "../chat-route-session";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const session = await getChatRouteSession();
  if (!session?.user) redirect("/login?callbackUrl=/explore");
  if (!(await isExploreMeghalayaEnabledForRole(session.user.role))) notFound();
  const categories = await withTimeout(listExploreCategories(), 5_000).catch(
    (error) => {
      console.error("[explore/page] Category load failed.", error);
      return null;
    }
  );
  return <ExplorePageClient initialCategories={categories} />;
}
