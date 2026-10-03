import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setAppSetting } from "@/lib/db/queries";
import { readGoogleBudget, saveGoogleBudgetAndProvider } from "@/lib/explore/google-budget";
import { googleBudgetInputSchema } from "@/lib/explore/google-budget-policy";
import { EXPLORE_PROVIDER_CACHE_TAG, readExploreProvider } from "@/lib/explore/provider-config";
import { EXPLORE_PROVIDER_SETTING_KEY, EXPLORE_PROVIDERS, exploreProviderConfigured } from "@/lib/explore/providers";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ provider: z.enum(EXPLORE_PROVIDERS), googleBudget: googleBudgetInputSchema.optional() }).strict();
function configured() {
  return Object.fromEntries(EXPLORE_PROVIDERS.map((provider) => [provider, exploreProviderConfigured(provider, process.env)]));
}
export async function GET(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  try {
    const [provider, googleBudget] = await Promise.all([readExploreProvider(), readGoogleBudget()]);
    return NextResponse.json({ provider, googleBudget, configured: configured() }, { headers });
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
  if (parsed.data.provider === "google" && parsed.data.googleBudget?.enabled && !exploreProviderConfigured(parsed.data.googleBudget.fallbackProvider, process.env)) return NextResponse.json({ error: "fallback_not_configured" }, { status: 409, headers });
  try {
    const googleBudget = parsed.data.googleBudget
      ? await saveGoogleBudgetAndProvider(parsed.data.provider, parsed.data.googleBudget)
      : undefined;
    if (!parsed.data.googleBudget) await setAppSetting({ key: EXPLORE_PROVIDER_SETTING_KEY, value: parsed.data.provider }, { adminDatabase: true, revalidateCache: false });
    revalidateTag(EXPLORE_PROVIDER_CACHE_TAG, { expire: 0 });
    console.info("[admin/explore/provider] updated", { actorId: admin.id, provider: parsed.data.provider });
    return NextResponse.json({ provider: parsed.data.provider, googleBudget, configured: configured() }, { headers });
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 503, headers });
  }
}
