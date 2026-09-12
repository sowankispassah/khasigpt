import { NextResponse } from "next/server";
import { runJobsScrapeWithScheduling } from "@/lib/jobs/scrape-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConfiguredSecret() {
  return (
    process.env.CRON_SECRET?.trim() ??
    process.env.JOBS_SCRAPE_SECRET?.trim() ??
    ""
  );
}

function isAuthorizedCronRequest(request: Request) {
  const configuredSecret = getConfiguredSecret();
  if (!configuredSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() === configuredSecret;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await runJobsScrapeWithScheduling({
      trigger: "cron",
      persistSkips: false,
    });
    const scrapeResult = result.scrapeResult;

    return NextResponse.json(
      {
        ok: result.ok,
        trigger: "cron",
        skipped: result.skipped,
        skipReason: result.skipReason,
        nextDueAt: result.nextDueAt,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        sourcesProcessed: scrapeResult?.summary.sourcesProcessed ?? 0,
        scrapedAfterFilters: scrapeResult?.jobs.length ?? 0,
        inserted: scrapeResult?.persisted.insertedCount ?? 0,
        updated: scrapeResult?.persisted.updatedCount ?? 0,
        skippedDuplicates: scrapeResult
          ? scrapeResult.persisted.skippedDuplicateCount +
            scrapeResult.summary.totalDuplicatesInRun
          : 0,
        errorMessage: result.errorMessage,
      },
      {
        status: result.ok ? 200 : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[api/cron/jobs-scrape] scrape_failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "scrape_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
