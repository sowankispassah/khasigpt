import "server-only";
import {
	readGoogleSearchAllowance,
	reserveGoogleSearchAllowance,
	settleGoogleSearchAllowance,
} from "./google-allowance";
import {
	GOOGLE_SEARCH_OUTPUT_LIMIT,
	GOOGLE_SEARCH_QUERY_RESERVATION,
	type GoogleSearchAllowance,
	GoogleSearchAllowanceError,
	groundingBillingMonth,
	groundingTokenCost,
} from "./google-allowance-policy";

export type GroundingAdmission = { maximumProviderCostUsd: number };
export async function prepareGoogleGrounding(
	prompt: string,
	beforeCall?: (admission?: GroundingAdmission) => void,
) {
	// Critical, uncached read. An unavailable counter must never enable paid Google.
	let policy: GoogleSearchAllowance;
	try {
		policy = await readGoogleSearchAllowance();
	} catch {
		throw new Error("google_search_allowance_tracking_unavailable");
	}
	if (!policy.enabled) {
		beforeCall?.();
		return null;
	}
	// UTF-8 byte allowance mirrors the existing text admission guard. The search
	// reserve also budgets 10 potentially paid queries; Google's internal calls
	// cannot be hard capped and the admin UI explicitly documents this limitation.
	const maximumProviderCostUsd =
		groundingTokenCost(
			policy,
			Buffer.byteLength(prompt, "utf8") + 1024,
			GOOGLE_SEARCH_OUTPUT_LIMIT,
		) +
		GOOGLE_SEARCH_QUERY_RESERVATION * 0.014;
	let reservation: Awaited<ReturnType<typeof reserveGoogleSearchAllowance>>;
	try {
		reservation = await reserveGoogleSearchAllowance(policy);
	} catch {
		throw new GoogleSearchAllowanceError(policy.fallbackProvider);
	}
	if (!reservation || reservation.month !== groundingBillingMonth())
		throw new GoogleSearchAllowanceError(policy.fallbackProvider);
	try {
		beforeCall?.({ maximumProviderCostUsd });
	} catch (error) {
		// Confirmed pre-dispatch rejection can safely return the entire reservation.
		await settleGoogleSearchAllowance(reservation.month, 0).catch(() => {});
		throw error;
	}
	return { policy, reservation, maximumBillableCostUsd: maximumProviderCostUsd };
}

export async function finishGoogleGrounding(
	attempt: NonNullable<Awaited<ReturnType<typeof prepareGoogleGrounding>>>,
	queries: number | null,
	inputTokens: number,
	outputTokens: number,
) {
	let paidQueries = 0;
	if (queries === null) return groundingTokenCost(attempt.policy, inputTokens, outputTokens);
	try {
		paidQueries = await settleGoogleSearchAllowance(
			attempt.reservation.month,
			queries,
		);
	} catch {
		console.warn(
			"[web-search/allowance] Settlement unavailable; reservation retained.",
		);
	}
	return (
		groundingTokenCost(attempt.policy, inputTokens, outputTokens) +
		paidQueries * 0.014
	);
}
