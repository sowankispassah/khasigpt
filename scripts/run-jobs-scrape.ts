import { getJobsScrapeRunnerModeUncached } from "@/lib/jobs/runner-mode";
import { runJobsScrapeWithScheduling } from "@/lib/jobs/scrape-orchestrator";
import { resolveJobsScrapeSources } from "@/lib/jobs/source-registry";

async function main() {
  if (process.argv.includes("--check")) {
    const [runnerMode, sources] = await Promise.all([
      getJobsScrapeRunnerModeUncached(),
      resolveJobsScrapeSources({ uncached: true }),
    ]);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        runnerMode,
        sourceCount: sources.scraperSources.length,
        usingFallbackSources: sources.usingFallbackSources,
      })}\n`
    );
    return;
  }

  const result = await runJobsScrapeWithScheduling({
    trigger: "chatgpt",
    persistSkips: false,
  });
  const scrape = result.scrapeResult;
  const fetchedSources = scrape?.summary.sourceStats.filter((source) => source.fetched).length ?? 0;

  process.stdout.write(
    `${JSON.stringify({
      ok: result.ok,
      skipped: result.skipped,
      skipReason: result.skipReason,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      sourcesProcessed: scrape?.summary.sourcesProcessed ?? 0,
      sourcesFetched: fetchedSources,
      inserted: scrape?.persisted.insertedCount ?? 0,
      updated: scrape?.persisted.updatedCount ?? 0,
      skippedDuplicates: scrape?.persisted.skippedDuplicateCount ?? 0,
      error: result.errorMessage,
    })}\n`
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[jobs-scheduled] run_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
