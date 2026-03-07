import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  clearJobsScrapeCancelRequest,
  getJobsScrapeProgressSnapshot,
  requestJobsScrapeCancel,
  runJobsScrapeWithScheduling,
} from "@/lib/jobs/scrape-orchestrator";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_TIMEOUT_MS = 8_000;

async function requireAdminUser() {
  const session = await withTimeout(auth(), AUTH_TIMEOUT_MS).catch(() => null);
  if (!session?.user || session.user.role !== "admin") {
    return null;
  }
  return session.user;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const user = await requireAdminUser();
  if (!user) {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  const progress = await getJobsScrapeProgressSnapshot();
  return noStoreJson({
    ok: true,
    progress,
  });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
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
