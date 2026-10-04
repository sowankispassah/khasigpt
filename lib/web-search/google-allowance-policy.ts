import { z } from "zod";

export const GOOGLE_SEARCH_ALLOWANCE_KEY = "web_search_google_allowance";
export const GOOGLE_SEARCH_ALLOWANCE_TAG = "web-search-google-allowance";
export const GOOGLE_SEARCH_OUTPUT_LIMIT = 2048;
export const GOOGLE_SEARCH_QUERY_RESERVATION = 10;

export function groundingBillingMonth(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
	}).formatToParts(date);
	return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

const count = z.number().int().min(0).max(10_000_000);
export const googleSearchAllowanceSchema = z
	.object({
		enabled: z.boolean(),
		fallbackProvider: z.enum(["serper", "disabled"]),
		model: z.string().regex(/^gemini-3(?:\.|-)[a-z0-9.-]+$/),
		limit: count.max(5000),
		safetyBuffer: count.max(5000),
		externalUsage: count,
		month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
		used: count,
		reserved: count,
		inputUsdPerMillion: z.number().positive().max(1000),
		outputUsdPerMillion: z.number().positive().max(1000),
	})
	.strict();
export const googleSearchAllowanceInputSchema =
	googleSearchAllowanceSchema.omit({ used: true, reserved: true });
export type GoogleSearchAllowance = z.infer<typeof googleSearchAllowanceSchema>;
export type GoogleSearchAllowanceInput = z.infer<
	typeof googleSearchAllowanceInputSchema
>;

export function parseGoogleSearchAllowance(
	value: unknown,
	month = groundingBillingMonth(),
): GoogleSearchAllowance {
	const policy =
		value === undefined
			? googleSearchAllowanceSchema.parse({
					enabled: false,
					fallbackProvider: "serper",
					model: "gemini-3.8-flash",
					limit: 5000,
					safetyBuffer: 100,
					externalUsage: 0,
					month,
					used: 0,
					reserved: 0,
					inputUsdPerMillion: 0.75,
					outputUsdPerMillion: 3.75,
				})
			: googleSearchAllowanceSchema.parse(value);
	return policy.month === month
		? policy
		: { ...policy, month, used: 0, reserved: 0, externalUsage: 0 };
}

// This is a soft guard: Google does not expose a hard per-answer query cap.
// Reserve multiple queries before dispatch and retain uncertain reservations.
export function hasGroundingAllowanceRoom(policy: GoogleSearchAllowance) {
	return (
		policy.used +
			policy.reserved +
			policy.externalUsage +
			GOOGLE_SEARCH_QUERY_RESERVATION <=
		policy.limit - policy.safetyBuffer
	);
}

export function groundingTokenCost(
	policy: GoogleSearchAllowance,
	inputTokens: number,
	outputTokens: number,
) {
	return (
		(Math.max(0, inputTokens) * policy.inputUsdPerMillion +
			Math.max(0, outputTokens) * policy.outputUsdPerMillion) /
		1_000_000
	);
}

export class GoogleSearchAllowanceError extends Error {
	constructor(public readonly fallbackProvider: "serper" | "disabled") {
		super("google_search_allowance_unavailable");
	}
}
