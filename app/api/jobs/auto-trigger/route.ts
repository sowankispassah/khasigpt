import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { runJobsScrapeWithScheduling } from "@/lib/jobs/scrape-orchestrator";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_TIMEOUT_MS = 8_000;
const SCRAPE_TIMEOUT_MS = 45_000;

async function requireSignedInUser() {
  const session = await withTimeout(auth(), AUTH_TIMEOUT_MS).catch(() => null);
  return session?.user ?? null;
}

export async function POST() {
  const user = await requireSignedInUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await withTimeout(
      runJobsScrapeWithScheduling({
        trigger: "auto",
        persistSkips: false,
      }),
      SCRAPE_TIMEOUT_MS
    );

    return NextResponse.json(
      {
        ok: result.ok,
        skipped: result.skipped,
        skipReason: result.skipReason,
        nextDueAt: result.nextDueAt,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        errorMessage: result.errorMessage,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/jobs/auto-trigger] scrape_failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "auto_trigger_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
