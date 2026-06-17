import { waitUntil } from "@vercel/functions";
import { type NextRequest, NextResponse } from "next/server";
import {
  clearJobsScrapeCancelRequest,
  getJobsScrapeProgressSnapshot,
  requestJobsScrapeCancel,
  runJobsScrapeWithScheduling,
} from "@/lib/jobs/scrape-orchestrator";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  const progress = await getJobsScrapeProgressSnapshot();
  return noStoreJson({
    ok: true,
    progress,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown }
    | null;
  const action =
    body && typeof body.action === "string" ? body.action.trim().toLowerCase() : "start";

  if (action === "cancel") {
    await requestJobsScrapeCancel();
    const progress = await getJobsScrapeProgressSnapshot();
    return noStoreJson({
      ok: true,
      action: "cancel",
      progress,
    });
  }

  const current = await getJobsScrapeProgressSnapshot();
  if (current?.state === "running") {
    return noStoreJson({
      ok: true,
      action: "start",
      accepted: false,
      alreadyRunning: true,
      progress: current,
    });
  }

  const runId = crypto.randomUUID();
  await clearJobsScrapeCancelRequest();

  const task = runJobsScrapeWithScheduling({
    trigger: "manual",
    ignoreLockForManual: true,
    runId,
  }).catch((error) => {
    console.error("[api/admin/jobs/scrape] background_run_failed", error);
  });

  waitUntil(task);

  return noStoreJson({
    ok: true,
    action: "start",
    accepted: true,
    runId,
  });
}
