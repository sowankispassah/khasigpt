import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toContactTableMessage } from "@/lib/admin/contact-table-message";
import { getContactMessageCount, listContactMessages } from "@/lib/db/queries";
import { changeReportStatus, listReportStatusEvents } from "@/lib/db/report-workflow";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sourceSchema = z.enum(["all", "chat", "forum", "other"]);
const statusSchema = z.enum(["all", "new", "in_progress", "resolved", "archived"]);
const updateSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema.exclude(["all"]),
  note: z.string().trim().max(2000).optional(),
});
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid report ID" }, { status: 400, headers: noStore });
    try {
      const events = await listReportStatusEvents(id);
      if (!events) return NextResponse.json({ error: "Report not found" }, { status: 404, headers: noStore });
      return NextResponse.json({ events }, { headers: noStore });
    } catch {
      return NextResponse.json({ error: "Unable to load report history" }, { status: 500, headers: noStore });
    }
  }
  const source = sourceSchema.safeParse(params.get("source") ?? "all");
  const status = statusSchema.safeParse(params.get("status") ?? "all");
  const search = (params.get("search") ?? "").trim();
  const page = Number(params.get("page") ?? 1);
  if (!source.success || !status.success || search.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers: noStore });
  }
  const filter = {
    kind: "report" as const,
    reportSource: source.data === "all" ? undefined : source.data,
    status: status.data,
    search,
  };
  try {
    const [rows, total] = await Promise.all([
      listContactMessages({ ...filter, limit: 25, offset: (page - 1) * 25 }),
      getContactMessageCount(filter),
    ]);
    return NextResponse.json({ rows: rows.map(toContactTableMessage), total, page }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to load reports" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-report-status:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 30, windowMs: 60_000 }
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, {
    status: 429, headers: { ...noStore, "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
  });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report action" }, { status: 400, headers: noStore });
  try {
    const result = await changeReportStatus({
      messageId: parsed.data.id,
      actorUserId: admin.id,
      status: parsed.data.status,
      note: parsed.data.note || null,
    });
    if (!result) return NextResponse.json({ error: "Report not found" }, { status: 404, headers: noStore });
    if (result.unchanged) return NextResponse.json({ error: "Status is already selected" }, { status: 409, headers: noStore });
    return NextResponse.json({ report: toContactTableMessage(result.report) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to update report" }, { status: 500, headers: noStore });
  }
}
