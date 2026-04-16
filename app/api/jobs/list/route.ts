import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { listJobListItems } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

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
