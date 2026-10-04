import { and, eq, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { createLiteAuditLogEntry } from "@/lib/db/app-settings-lite";
import { modelConfig } from "@/lib/db/schema";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { hasWebSearchProviderPricing, loadWebSearchConfig, WEB_SEARCH_CONFIG_CACHE_TAG } from "@/lib/web-search/config";
import {
	readGoogleSearchAllowance,
	saveGoogleSearchAllowance,
} from "@/lib/web-search/google-allowance";
import {
	GOOGLE_SEARCH_ALLOWANCE_TAG,
	googleSearchAllowanceInputSchema,
} from "@/lib/web-search/google-allowance-policy";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
	if (!(await requireAdminApiUser(request)))
		return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
	try {
		const [allowance, models] = await Promise.all([
			readGoogleSearchAllowance(),
			withAdminDatabase("web-search.allowance.models", (database) =>
				database
					.select({
						model: modelConfig.providerModelId,
						inputUsdPerMillion: modelConfig.inputProviderCostPerMillion,
						outputUsdPerMillion: modelConfig.outputProviderCostPerMillion,
					})
					.from(modelConfig)
					.where(
						and(
							eq(modelConfig.provider, "google"),
							eq(modelConfig.isEnabled, true),
							isNull(modelConfig.deletedAt),
						),
					),
			),
		]);
		return NextResponse.json(
			{
				allowance,
				models: models.filter((model) => /^gemini-3(?:\.|-)/.test(model.model)),
				configured: {
					google: Boolean(process.env.GOOGLE_API_KEY?.trim()),
					serper: Boolean(process.env.SERPER_API_KEY?.trim()),
				},
			},
			{ headers },
		);
	} catch {
		return NextResponse.json(
			{ error: "configuration_unavailable" },
			{ status: 503, headers },
		);
	}
}
export async function POST(request: NextRequest) {
	const user = await requireAdminApiUser(request);
	if (!user)
		return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
	const parsed = googleSearchAllowanceInputSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success)
		return NextResponse.json(
			{ error: "invalid_allowance" },
			{ status: 400, headers },
		);
	if (
		parsed.data.enabled &&
		(!process.env.GOOGLE_API_KEY?.trim() ||
			(parsed.data.fallbackProvider === "serper" &&
				!process.env.SERPER_API_KEY?.trim()))
	)
		return NextResponse.json(
			{ error: "provider_not_configured" },
			{ status: 409, headers },
		);
	try {
		if (parsed.data.enabled && parsed.data.fallbackProvider === "serper") {
			const config = await loadWebSearchConfig();
			if (config.readState !== "confirmed" || !hasWebSearchProviderPricing(config, "serper")) return NextResponse.json({ error: "fallback_pricing_missing" }, { status: 409, headers });
		}
		const allowance = await saveGoogleSearchAllowance(parsed.data);
		revalidateTag(GOOGLE_SEARCH_ALLOWANCE_TAG, { expire: 0 });
		revalidateTag(WEB_SEARCH_CONFIG_CACHE_TAG, { expire: 0 });
		void createLiteAuditLogEntry({
			actorId: user.id,
			action: "settings.web_search.allowance.update",
			target: { setting: "web_search" },
			metadata: parsed.data,
		}).catch(() => {});
		return NextResponse.json({ allowance }, { headers });
	} catch {
		return NextResponse.json(
			{ error: "save_failed" },
			{ status: 503, headers },
		);
	}
}
