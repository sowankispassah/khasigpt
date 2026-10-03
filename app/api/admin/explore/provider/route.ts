import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setAppSetting } from "@/lib/db/queries";
import { EXPLORE_PROVIDER_CACHE_TAG, readExploreProvider } from "@/lib/explore/provider-config";
import { EXPLORE_PROVIDER_SETTING_KEY, EXPLORE_PROVIDERS, exploreProviderConfigured } from "@/lib/explore/providers";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ provider: z.enum(EXPLORE_PROVIDERS) }).strict();
function configured() {
  return Object.fromEntries(EXPLORE_PROVIDERS.map((provider) => [provider, exploreProviderConfigured(provider, process.env)]));
}
export async function GET(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  try {
    return NextResponse.json({ provider: await readExploreProvider(), configured: configured() }, { headers });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
}
export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
  if (!exploreProviderConfigured(parsed.data.provider, process.env)) return NextResponse.json({ error: "not_configured" }, { status: 409, headers });
  try {
    await setAppSetting({ key: EXPLORE_PROVIDER_SETTING_KEY, value: parsed.data.provider }, { adminDatabase: true, revalidateCache: false });
    revalidateTag(EXPLORE_PROVIDER_CACHE_TAG, { expire: 0 });
    console.info("[admin/explore/provider] updated", { actorId: admin.id, provider: parsed.data.provider });
    return NextResponse.json({ provider: parsed.data.provider, configured: configured() }, { headers });
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 503, headers });
  }
}
