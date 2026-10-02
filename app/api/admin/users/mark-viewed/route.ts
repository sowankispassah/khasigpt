import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markNewUsersViewed } from "@/lib/admin/user-notifications";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const payload = z
	.object({
		checkedThrough: z
			.string()
			.datetime()
			.refine((value) => Date.parse(value) >= 0),
	})
	.strict();

export async function POST(request: NextRequest) {
	const admin = await requireAdminApiUser(request);
	if (!admin)
		return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
	const origin = request.headers.get("origin");
	if (origin && origin !== request.nextUrl.origin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
	}
	const { allowed } = await incrementRateLimit(
		`admin-users-viewed:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
		{ limit: 60, windowMs: 60_000 },
	);
	if (!allowed)
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers },
		);
	const parsed = payload.safeParse(await request.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json(
			{ error: "Invalid checkpoint" },
			{ status: 400, headers },
		);
	try {
		const count = await markNewUsersViewed(
			admin.id,
			new Date(parsed.data.checkedThrough),
		);
		return NextResponse.json({ count }, { headers });
	} catch {
		console.error("[admin.users] Unable to mark new users viewed.");
		return NextResponse.json(
			{ error: "Unable to mark new users viewed" },
			{ status: 503, headers },
		);
	}
}
