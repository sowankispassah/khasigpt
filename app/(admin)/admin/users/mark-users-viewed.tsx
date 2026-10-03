"use client";

import { useEffect } from "react";

export function MarkUsersViewed({
	checkedThrough,
}: {
	checkedThrough: string;
}) {
	useEffect(() => {
		let cancelled = false;
		let pending = false;
		let completed = false;
		const controller = new AbortController();
		async function acknowledge() {
			if (document.visibilityState !== "visible" || pending || completed)
				return;
			pending = true;
			const timeout = window.setTimeout(() => controller.abort(), 15_000);
			try {
				const response = await fetch("/api/admin/users/mark-viewed", {
					method: "POST",
					credentials: "same-origin",
					cache: "no-store",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ checkedThrough }),
					signal: controller.signal,
				});
				if (response.ok && !cancelled) {
					completed = true;
					window.dispatchEvent(new Event("admin:users-unviewed-count"));
				}
			} catch {
				// Keep the previous badge on failure. Reopening Users retries the write.
			} finally {
				window.clearTimeout(timeout);
				pending = false;
			}
		}
		void acknowledge();
		document.addEventListener("visibilitychange", acknowledge);
		return () => {
			cancelled = true;
			controller.abort();
			document.removeEventListener("visibilitychange", acknowledge);
		};
	}, [checkedThrough]);
	return null;
}
