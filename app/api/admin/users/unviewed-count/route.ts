import { type NextRequest, NextResponse } from "next/server";
import { getNewUserCount } from "@/lib/admin/user-notifications";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
	const admin = await requireAdminApiUser(request);
	if (!admin)
		return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
	const { allowed } = await incrementRateLimit(
		`admin-users-unviewed:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
		{ limit: 120, windowMs: 60_000 },
	);
	if (!allowed)
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers },
		);
	try {
		return NextResponse.json(
			{ count: await getNewUserCount(admin.id) },
			{ headers },
		);
	} catch {
		console.error("[admin.users] Unable to load new-user count.");
		return NextResponse.json(
			{ error: "Unable to load new-user count" },
			{ status: 503, headers },
		);
	}
}
