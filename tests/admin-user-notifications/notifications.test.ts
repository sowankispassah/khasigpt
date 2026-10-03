import { type BrowserContext, expect, test } from "@playwright/test";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env" });
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const databaseUrl = process.env.POSTGRES_URL;

async function signIn(
	context: BrowserContext,
	baseURL: string | undefined,
	role: "admin" | "regular",
) {
	if (!baseURL || new URL(baseURL).hostname !== "localhost")
		throw new Error("Tests require a local server.");
	if (!databaseUrl || !secret)
		throw new Error("Local verification credentials required.");
	const client = postgres(databaseUrl, { max: 1 });
	try {
		const [account] =
			await client`SELECT id, "firstName", "lastName", "dateOfBirth" FROM "User" WHERE role = ${role} AND "isActive" = true LIMIT 1`;
		if (!account) throw new Error("Verification account unavailable.");
		const token = {
			...account,
			role,
			roleRefreshedAt: Date.now(),
			dbRefreshedAt: Date.now(),
			imageVersion: null,
		};
		for (const name of [
			"authjs.session-token",
			"__Secure-authjs.session-token",
		]) {
			const value = await encode({ secret, salt: name, token, maxAge: 600 });
			await context.addCookies([
				{
					name,
					value,
					domain: "localhost",
					path: "/",
					httpOnly: true,
					secure: name.startsWith("__Secure"),
					sameSite: "Lax",
				},
			]);
		}
	} finally {
		await client.end();
	}
}

test("anonymous and regular users cannot read or acknowledge admin notifications", async ({
	page,
	context,
	baseURL,
}) => {
	for (const signedIn of [false, true]) {
		if (signedIn) await signIn(context, baseURL, "regular");
		const read = await page.request.get("/api/admin/users/unviewed-count");
		expect(read.status()).toBe(403);
		expect(read.headers()["cache-control"]).toBe("no-store");
		expect(
			(
				await page.request.post("/api/admin/users/mark-viewed", {
					data: { checkedThrough: new Date().toISOString() },
				})
			).status(),
		).toBe(403);
	}
});

test("admin count is private and invalid or cross-origin writes are rejected", async ({
	page,
	context,
	baseURL,
}) => {
	await signIn(context, baseURL, "admin");
	const read = await page.request.get("/api/admin/users/unviewed-count");
	expect(read.status()).toBe(200);
	expect(read.headers()["cache-control"]).toBe("no-store");
	const body = await read.json();
	expect(Object.keys(body)).toEqual(["count"]);
	expect(Number.isSafeInteger(body.count)).toBe(true);
	expect(body.count).toBeGreaterThanOrEqual(0);
	for (const data of [
		{},
		{ checkedThrough: "invalid" },
		{ checkedThrough: new Date().toISOString(), adminId: "other" },
	]) {
		expect(
			(
				await page.request.post("/api/admin/users/mark-viewed", { data })
			).status(),
		).toBe(400);
	}
	expect(
		(
			await page.request.post("/api/admin/users/mark-viewed", {
				headers: { Origin: "https://untrusted.invalid" },
				data: { checkedThrough: new Date().toISOString() },
			})
		).status(),
	).toBe(403);
});

for (const success of [true, false]) {
	test(`Users badge ${success ? "clears after successful loading" : "survives acknowledgement and refresh failures"}`, async ({
		page,
		context,
		baseURL,
	}) => {
		await signIn(context, baseURL, "admin");
		// All browser writes are intercepted: no real admin checkpoints are changed.
		let count = 7;
		let failRead = false;
		let acknowledgements = 0;
		let release: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/api/admin/users/unviewed-count", (route) =>
			route.fulfill(
				failRead
					? { status: 503, json: { error: "Unavailable" } }
					: { json: { count } },
			),
		);
		await page.route("**/api/admin/users/mark-viewed", async (route) => {
			acknowledgements += 1;
			expect(
				Number.isFinite(
					Date.parse(route.request().postDataJSON().checkedThrough),
				),
			).toBe(true);
			await held;
			if (success) count = 0;
			await route.fulfill({
				status: success ? 200 : 503,
				json: success ? { count } : { error: "Unavailable" },
			});
		});
		await page.route("**/api/admin/contact-messages/unread-counts", (route) =>
			route.fulfill({ json: { contacts: 2, reports: 4 } }),
		);
		await page.goto("/admin/users");
		const usersLink = page.locator('a[href="/admin/users"]').first();
		await expect(usersLink).toHaveAttribute(
			"aria-label",
			/Unread in Users: 7/i,
			{ timeout: 60000 },
		);
		await expect.poll(() => acknowledgements).toBeGreaterThan(0);
		await page.screenshot({
			path: `tmp/admin-users-badge-${success ? "success" : "failure"}.png`,
		});
		release?.();
		if (success) {
			await expect(usersLink).not.toHaveAttribute("aria-label", /Unread/);
		} else {
			await expect(usersLink).toHaveAttribute(
				"aria-label",
				/Unread in Users: 7/i,
			);
			failRead = true;
			await page.evaluate(() =>
				window.dispatchEvent(new Event("admin:users-unviewed-count")),
			);
			await expect(usersLink).toHaveAttribute(
				"aria-label",
				/Unread in Users: 7/i,
			);
		}
		await expect(
			page.locator('a[href="/admin/reports"]').first(),
		).toHaveAttribute("aria-label", /Unread in Reports: 4/i);
		await expect(
			page.getByRole("heading", { name: "User management", exact: true }),
		).toBeVisible();
	});
}
