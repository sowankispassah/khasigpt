export const GOOGLE_ALLOWANCE_COPY = {
	title: "Google monthly search allowance",
	variableCharge: "Based on actual tokens",
	pricingNote: "In allowance mode, Google Search queries within the free allowance cost $0. Google generation tokens use the rates above and this row's markup. The fixed search-unit price below does not apply in this mode; Serper or Serpent uses its saved price when selected as fallback.",
	description:
		"Choose a fixed primary provider above, or enable Google-first routing with a fallback below. This allowance is separate from Google Places.",
	enabled: "Use Google first, then switch near its free allowance",
	model: "Google grounding model",
	fallback: "Provider after the allowance",
	serper: "Serper",
	serpent: "Serpent",
	disabled: "No web search; use the normal chat answer",
	limit: "Monthly search-query allowance",
	buffer: "Search queries to keep as a safety buffer",
	external: "Earlier or external Google search queries this month",
	input: "Google input cost (USD per million tokens)",
	output: "Google output cost (USD per million tokens)",
	usage:
		"Tracked queries: {used} · Reserved or uncertain: {reserved} · Other usage: {external} · Month: {month}",
	note: "Gemini 3.x shares 5,000 free Google Search queries per month. One answer can run several searches. Gemini generation tokens remain billable; the rates below apply to the selected grounding model. Verify rates if you change models or Google changes pricing.",
	warning:
		"This is an app usage guard, not a Google billing cap. Google cannot hard-limit searches per answer, so a request can exceed the reserved 10 queries or the remaining allowance. A safety buffer reduces that risk but cannot guarantee zero paid searches. Earlier or external usage must be entered from Google's usage reports and cannot be lowered within the month. Failed requests retain their reservations. Usage resets at the start of the month in Pacific time.",
	scope:
		"This guard covers chat and the shared natural-language search backend on web and mobile. Places, photos, and other apps have separate tracking. Your existing feature access, free/paid-user eligibility, and credit checks still apply.",
	save: "Save allowance routing",
	saving: "Saving…",
	reload: "Reload allowance",
	loading: "Loading allowance…",
	saved:
		"Allowance routing saved. Google becomes the primary provider when this mode is enabled.",
	error:
		"The allowance could not be loaded or saved. Reload and try again. Check server keys, fallback pricing, and the billing month before saving.",
} as const;
