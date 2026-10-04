"use client";
import { useCallback, useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { GOOGLE_ALLOWANCE_COPY } from "@/lib/web-search/google-allowance-copy";
import {
	type GoogleSearchAllowance,
	googleSearchAllowanceInputSchema,
	groundingBillingMonth,
} from "@/lib/web-search/google-allowance-policy";

type Configuration = {
	allowance: GoogleSearchAllowance;
	models: {
		model: string;
		inputUsdPerMillion: number;
		outputUsdPerMillion: number;
	}[];
	configured: { google: boolean; serper: boolean; serpent: boolean };
};
function Copy({ name, values }: { name: keyof typeof GOOGLE_ALLOWANCE_COPY; values?: Record<string, string | number> }) {
	return (
		<EditableTranslation
			translationKey={`admin.web_search.allowance.${name}`}
			defaultText={GOOGLE_ALLOWANCE_COPY[name]}
			description="Admin Google grounding allowance settings." values={values}
		/>
	);
}

export function GoogleSearchAllowanceSettings({
	onSaved,
	refreshToken = 0,
}: {
	onSaved: (allowance: GoogleSearchAllowance) => void;
	refreshToken?: number;
}) {
	const { translate } = useTranslation();
	const [configuration, setConfiguration] = useState<Configuration | null>(
		null,
	);
	const [policy, setPolicy] = useState<GoogleSearchAllowance | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(false);
	const [saved, setSaved] = useState(false);
	const load = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(false);
		try {
			const response = await fetch(
				"/api/admin/pricing/web-search/google-allowance",
				{ cache: "no-store", credentials: "same-origin", signal },
			);
			if (!response.ok) throw new Error("load_failed");
			const value = (await response.json()) as Configuration;
			if (
				!googleSearchAllowanceInputSchema.safeParse(
					(({ used, reserved, ...input }) => input)(value.allowance),
				).success
			)
				throw new Error("invalid_configuration");
			setConfiguration(value);
			setPolicy(value.allowance);
			setSaved(false);
		} catch {
			if (!signal?.aborted) setError(true);
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, []);
	useEffect(() => {
		if (refreshToken < 0) return;
		const controller = new AbortController();
		void load(controller.signal);
		return () => controller.abort();
	}, [load, refreshToken]);
	const save = async () => {
		if (!policy) return;
		setSaving(true);
		setError(false);
		setSaved(false);
		try {
			const { used: _used, reserved: _reserved, ...input } = policy;
			const response = await fetch(
				"/api/admin/pricing/web-search/google-allowance",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "same-origin",
					cache: "no-store",
					body: JSON.stringify(input),
				},
			);
			if (!response.ok) throw new Error("save_failed");
			const value = (await response.json()) as {
				allowance: GoogleSearchAllowance;
			};
			setPolicy(value.allowance);
			setConfiguration((current) =>
				current ? { ...current, allowance: value.allowance } : null,
			);
			onSaved(value.allowance);
			setSaved(true);
		} catch {
			setError(true);
		} finally {
			setSaving(false);
		}
	};
	return (
		<section
			className="space-y-4 rounded-xl border bg-card p-4"
			aria-busy={loading || saving}
		>
			<h3 className="font-semibold">
				<Copy name="title" />
			</h3>
			<p className="text-muted-foreground text-sm">
				<Copy name="description" />
			</p>
			{loading && (
				<output className="block">
					<Copy name="loading" />
				</output>
			)}
			{policy && configuration && (
				<>
					<label
						aria-label={translate("admin.web_search.allowance.enabled", GOOGLE_ALLOWANCE_COPY.enabled)} htmlFor="google-allowance-enabled"
						className="flex cursor-pointer items-center gap-3 text-sm"
					>
						<input
							id="google-allowance-enabled"
							className="cursor-pointer"
							type="checkbox"
							checked={policy.enabled}
							disabled={saving || loading || !configuration.configured.google}
							onChange={(event) => {
								setPolicy({ ...policy, enabled: event.target.checked });
								setSaved(false);
							}}
						/>
						<Copy name="enabled" />
					</label>
					{policy.enabled && (
						<>
							<p className="text-muted-foreground text-xs">
								<Copy name="note" />
							</p>
							<div className="grid gap-4 md:grid-cols-2">
								<label className="space-y-2 text-sm">
									<span className="block">
										<Copy name="model" />
									</span>
									<select
										className="w-full cursor-pointer rounded-md border bg-background px-3 py-2"
										value={policy.model}
										disabled={saving}
										onChange={(event) => {
											const model = configuration.models.find(
												(item) => item.model === event.target.value,
											);
											setPolicy({
												...policy,
												model: event.target.value,
												...(model &&
												model.inputUsdPerMillion > 0 &&
												model.outputUsdPerMillion > 0
													? {
															inputUsdPerMillion: model.inputUsdPerMillion,
															outputUsdPerMillion: model.outputUsdPerMillion,
														}
													: {}),
											});
											setSaved(false);
										}}
									>
										{Array.from(
											new Set([
												policy.model,
												...configuration.models.map((item) => item.model),
											]),
										).map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))}
									</select>
								</label>
								<label className="space-y-2 text-sm">
									<span className="block">
										<Copy name="fallback" />
									</span>
									<select
										className="w-full cursor-pointer rounded-md border bg-background px-3 py-2"
										disabled={saving}
										value={policy.fallbackProvider}
										onChange={(event) => {
											setPolicy({
												...policy,
												fallbackProvider: event.target
													.value as GoogleSearchAllowance["fallbackProvider"],
											});
											setSaved(false);
										}}
									>
										<option
											value="serper"
											disabled={!configuration.configured.serper}
										>
											{translate(
												"admin.web_search.allowance.serper",
												GOOGLE_ALLOWANCE_COPY.serper,
											)}
										</option>
										<option value="serpent" disabled={!configuration.configured.serpent}>{translate("admin.web_search.allowance.serpent", GOOGLE_ALLOWANCE_COPY.serpent)}</option>
                                        <option value="disabled">
											{translate(
												"admin.web_search.allowance.disabled",
												GOOGLE_ALLOWANCE_COPY.disabled,
											)}
										</option>
									</select>
								</label>
								{(
									[
										["limit", "limit", 5000],
										["buffer", "safetyBuffer", 5000],
										["external", "externalUsage", 10_000_000],
										["input", "inputUsdPerMillion", 1000],
										["output", "outputUsdPerMillion", 1000],
									] as const
								).map(([label, field, max]) => (
									<label
										key={field}
										aria-label={translate(`admin.web_search.allowance.${label}`, GOOGLE_ALLOWANCE_COPY[label])} htmlFor={`google-allowance-${field}`}
										className="space-y-2 text-sm"
									>
										<span className="block">
											<Copy name={label} />
										</span>
										<input
											id={`google-allowance-${field}`}
											className="w-full rounded-md border bg-background px-3 py-2"
											type="number"
											min={field.endsWith("Million") ? 0.000001 : 0}
											max={max}
											step={field.endsWith("Million") ? "any" : 1}
											disabled={saving}
											value={
												Number.isFinite(policy[field]) ? policy[field] : ""
											}
											onChange={(event) => {
												setPolicy({
													...policy,
													[field]: event.target.valueAsNumber,
												});
												setSaved(false);
											}}
										/>
									</label>
								))}
							</div>
							<p className="rounded-lg border border-amber-400/40 p-3 text-muted-foreground text-xs">
								<Copy name="warning" />
							</p>
							<p className="text-muted-foreground text-xs">
								<Copy name="scope" />
							</p>
						</>
					)}
					<p className="text-sm">
						<Copy name="usage" values={{ used: policy.used, reserved: policy.reserved, external: policy.externalUsage, month: policy.month }} />
					</p>
					<Button
						className="cursor-pointer"
						disabled={
							saving ||
							loading ||
							policy.month !== groundingBillingMonth() ||
							!googleSearchAllowanceInputSchema.safeParse(
								(({ used, reserved, ...input }) => input)(policy),
							).success ||
							(policy.enabled &&
								(!configuration.configured.google ||
									(policy.fallbackProvider === "serper" &&
										!configuration.configured.serper) || (policy.fallbackProvider === "serpent" && !configuration.configured.serpent)))
						}
						onClick={() => void save()}
					>
						{saving && <span className="mr-2 animate-spin"><LoaderIcon size={14} /></span>}<Copy name={saving ? "saving" : "save"} />
					</Button>
				</>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					<Copy name="error" />
				</p>
			)}
			{saved && (
				<output className="block text-sm">
					<Copy name="saved" />
				</output>
			)}
			<Button
				className="cursor-pointer"
				variant="outline"
				disabled={loading || saving}
				onClick={() => void load()}
			>
				<Copy name="reload" />
			</Button>
		</section>
	);
}
