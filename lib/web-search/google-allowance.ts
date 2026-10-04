import "server-only";
import { eq, sql } from "drizzle-orm";
import {
	WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
	WEB_SEARCH_PROVIDER_SETTING_KEY,
} from "@/lib/constants";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { appSetting } from "@/lib/db/schema";
import {
	GOOGLE_SEARCH_ALLOWANCE_KEY,
	GOOGLE_SEARCH_QUERY_RESERVATION,
	type GoogleSearchAllowanceInput,
	googleSearchAllowanceInputSchema,
	groundingBillingMonth,
	parseGoogleSearchAllowance,
} from "./google-allowance-policy";

export async function readGoogleSearchAllowance() {
	return withAdminDatabase("web-search.allowance.read", async (database) => {
		const [row] = await database
			.select({ value: appSetting.value })
			.from(appSetting)
			.where(eq(appSetting.key, GOOGLE_SEARCH_ALLOWANCE_KEY))
			.limit(1);
		return parseGoogleSearchAllowance(row?.value);
	});
}

export async function reserveGoogleSearchAllowance(
	expected: GoogleSearchAllowanceInput,
) {
	const month = groundingBillingMonth();
	const sameMonth = sql`value->>'month' = ${month}`;
	const used = sql`CASE WHEN ${sameMonth} THEN (value->>'used')::integer ELSE 0 END`;
	const reserved = sql`CASE WHEN ${sameMonth} THEN (value->>'reserved')::integer ELSE 0 END`;
	const external = sql`CASE WHEN ${sameMonth} THEN (value->>'externalUsage')::integer ELSE 0 END`;
	return withAdminDatabase(
		"web-search.allowance.reserve",
		async (database) => {
			const rows = await database.execute(sql`
      UPDATE "AppSetting" SET value = value || jsonb_build_object('month', ${month}::text, 'used', (${used}), 'externalUsage', (${external}), 'reserved', (${reserved}) + ${GOOGLE_SEARCH_QUERY_RESERVATION}::integer), "updatedAt" = now()
      WHERE key = ${GOOGLE_SEARCH_ALLOWANCE_KEY} AND value->>'enabled' = 'true'
        AND value->>'model' = ${expected.model}
        AND (value->>'inputUsdPerMillion')::numeric = ${expected.inputUsdPerMillion}
        AND (value->>'outputUsdPerMillion')::numeric = ${expected.outputUsdPerMillion}
        AND (${used}) + (${reserved}) + (${external}) + ${GOOGLE_SEARCH_QUERY_RESERVATION}::integer <= (value->>'limit')::integer - (value->>'safetyBuffer')::integer
      RETURNING key
    `);
			return rows.length
				? { month, queries: GOOGLE_SEARCH_QUERY_RESERVATION }
				: null;
		},
		{ retry: false },
	);
}

export async function settleGoogleSearchAllowance(
	month: string,
	actualQueries: number,
) {
	if (
		!Number.isSafeInteger(actualQueries) ||
		actualQueries < 0 ||
		actualQueries > 1_000_000
	)
		throw new Error("invalid_search_query_count");
	return withAdminDatabase(
		"web-search.allowance.settle",
		async (database) => {
			const rows = await database.execute(sql`
      UPDATE "AppSetting" SET value = value || jsonb_build_object('used', (value->>'used')::integer + ${actualQueries}::integer, 'reserved', greatest(0, (value->>'reserved')::integer - ${GOOGLE_SEARCH_QUERY_RESERVATION}::integer)), "updatedAt" = now()
      WHERE key = ${GOOGLE_SEARCH_ALLOWANCE_KEY} AND value->>'month' = ${month}
      RETURNING greatest(0, (value->>'used')::integer + (value->>'externalUsage')::integer - 5000) - greatest(0, (value->>'used')::integer - ${actualQueries}::integer + (value->>'externalUsage')::integer - 5000) AS "paidQueries"
    `);
		// A response crossing a month boundary cannot establish Google's billing day.
		// The app absorbs uncertain search fees; never invent a customer charge.
		return rows.length ? Number(rows[0].paidQueries) : 0;
		},
		{ retry: false },
	);
}

export async function saveGoogleSearchAllowance(
	input: GoogleSearchAllowanceInput,
	settings: Record<string, unknown> = {},
) {
	input = googleSearchAllowanceInputSchema.parse(input);
	const month = groundingBillingMonth();
	if (input.month !== month) throw new Error("stale_billing_month");
	return withAdminDatabase(
		"web-search.allowance.save",
		(database) =>
			database.transaction(async (tx) => {
				await tx
					.insert(appSetting)
					.values({
						key: GOOGLE_SEARCH_ALLOWANCE_KEY,
						value: parseGoogleSearchAllowance(undefined, month),
					})
					.onConflictDoNothing();
				const [row] = await tx
					.select({ value: appSetting.value })
					.from(appSetting)
					.where(eq(appSetting.key, GOOGLE_SEARCH_ALLOWANCE_KEY))
					.for("update");
				const previous = parseGoogleSearchAllowance(row.value, month);
				const policy = parseGoogleSearchAllowance(
					{
						...previous,
						...input,
						externalUsage: Math.max(
							previous.externalUsage,
							input.externalUsage,
						),
					},
					month,
				);
				await tx
					.update(appSetting)
					.set({ value: policy, updatedAt: new Date() })
					.where(eq(appSetting.key, GOOGLE_SEARCH_ALLOWANCE_KEY));
				if (policy.enabled) {
					for (const [key, value] of [
						[WEB_SEARCH_PROVIDER_SETTING_KEY, "gemini_grounding"],
						[WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY, policy.fallbackProvider],
					]) {
						await tx
							.insert(appSetting)
							.values({ key, value })
							.onConflictDoUpdate({
								target: appSetting.key,
								set: { value, updatedAt: new Date() },
							});
					}
				}
				for (const [key, value] of Object.entries(settings)) {
					await tx.insert(appSetting).values({ key, value }).onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: new Date() } });
				}
				return policy;
			}),
		{ retry: false },
	);
}
