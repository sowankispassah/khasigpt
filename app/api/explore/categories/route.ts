import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { listExploreCategories } from "@/lib/explore/service";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStoreHeaders() });
  }
  const enabled = await isExploreMeghalayaEnabledForRole(auth.user.role).catch(
    () => false
  );
  if (!enabled) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStoreHeaders() });
  }
  try {
    const categories = await withTimeout(listExploreCategories(), 5_000);
    return NextResponse.json({ categories }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error("[api/explore/categories] Read failed.", error);
    return NextResponse.json(
      { error: "unavailable", message: "Explore categories are temporarily unavailable." },
      { status: 503, headers: noStoreHeaders() }
    );
  }
}
