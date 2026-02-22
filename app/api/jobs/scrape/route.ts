import { NextResponse } from "next/server";
import { runJobsScrapeWithScheduling } from "@/lib/jobs/scrape-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConfiguredSecret() {
  return (
    process.env.JOBS_SCRAPE_SECRET?.trim() ??
    process.env.CRON_SECRET?.trim() ??
    ""
  );
}

function getRequestSecret(request: Request) {
  const headerSecret = request.headers.get("x-scrape-token")?.trim();
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function runScrapeRequest(request: Request) {
  const configuredSecret = getConfiguredSecret();
  if (!configuredSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_secret_configuration",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const requestSecret = getRequestSecret(request);
  if (requestSecret !== configuredSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const url = new URL(request.url);
  const triggerParam = url.searchParams.get("trigger")?.trim().toLowerCase();
  const trigger = triggerParam === "manual" ? "manual" : "auto";
  const result = await runJobsScrapeWithScheduling({ trigger });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        trigger,
        skipped: result.skipped,
        skipReason: result.skipReason,
        nextDueAt: result.nextDueAt,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        error: "scrape_failed",
        message: result.errorMessage,
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const scrapeResult = result.scrapeResult;

  return NextResponse.json(
    {
      ok: true,
      trigger,
      skipped: result.skipped,
      skipReason: result.skipReason,
      nextDueAt: result.nextDueAt,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      sourcesProcessed: scrapeResult?.summary.sourcesProcessed ?? 0,
      lookbackDays: scrapeResult?.summary.lookbackDays ?? null,
      scrapedAfterFilters: scrapeResult?.jobs.length ?? 0,
      inserted: scrapeResult?.persisted.insertedCount ?? 0,
      skippedDuplicates: scrapeResult
        ? scrapeResult.persisted.skippedDuplicateCount +
          scrapeResult.summary.totalDuplicatesInRun
        : 0,
      filteredByLocation: scrapeResult?.summary.totalFilteredByLocation ?? 0,
      filteredByDate: scrapeResult?.summary.totalFilteredByDate ?? 0,
      sourceStats: scrapeResult?.summary.sourceStats ?? [],
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(request: Request) {
  try {
    return await runScrapeRequest(request);
  } catch (error) {
    console.error("[api/jobs/scrape] scrape_failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "scrape_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
