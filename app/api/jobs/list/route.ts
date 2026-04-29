import { NextResponse } from "next/server";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { listJobListItems } from "@/lib/jobs/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getMobileSession(request);

  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobsEnabled = await isJobsEnabledForRole(session.user.role ?? null);
  if (!jobsEnabled) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const items = await listJobListItems();

  return NextResponse.json(items, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}
