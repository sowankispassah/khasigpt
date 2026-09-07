# KhasiGPT traffic capacity test

The local wallet tests verify correctness under concurrent SQL writes. They do not establish how many public users Vercel, Supabase or the AI services can support. No production capacity result has been measured yet.

## Environment and data

Use a separate staging deployment and database with the production schema, indexes, connection limits, region placement and comparable plan sizes. Seed synthetic users, realistic chat/history sizes and jobs. Keep production credentials, customer content, payment webhooks and email sending out of this environment. The local `tests/support/jobs-service.cjs` is a narrow HTTP fixture for route tests; staging must use real Supabase/PostgREST.

Create 50 synthetic users and obtain one mobile bearer token per user through the staging login flow. The bootstrap endpoint does not accept cookie authentication. Keep tokens in an ignored local file, such as `tmp/staging-load.json`:

```json
{
  "target": "https://YOUR-STAGING-DEPLOYMENT.example",
  "stagingConfirmed": true,
  "tokens": ["FIRST_TEST_USER_TOKEN", "SECOND_TEST_USER_TOKEN"],
  "stages": [1, 2],
  "secondsPerStage": 60,
  "output": "tmp/staging-load-results.json"
}
```

Run `node scripts/load-test.mjs tmp/staging-load.json`. Start with 1–2 users to verify authentication and data. Then supply 50 distinct tokens and set stages to `[5, 10, 25, 50]`. Each user cycles through bootstrap, paginated history and jobs with a one-second pause. The runner reports latency percentiles, throughput and errors per stage and endpoint. It counts degraded bootstrap responses and missing sessions as failures, even when HTTP status is 200. It refuses the known public production domains, limits runs to 5,000 requests and stops on sustained errors or very slow responses.

## Acceptance and monitoring

- Initial target: each stage has under 1% errors and p95 under 2.5 seconds. These are proposed launch targets, not previously achieved results. The runner fails if any stage misses them; its emergency stop thresholds are 5% errors or p95 above 10 seconds over a rolling sample of at least 20 requests.
- Observe Vercel function duration, cold starts, failures and concurrency while sampling database connections, lock waits and slow queries. For the currently observed 60-connection database limit, retain at least 12 connections of headroom. Abort manually if connection pressure or lock waits rise before the HTTP stop thresholds.
- Repeat from the expected users' region. Compare cold and warm traffic, and run a 30-minute soak at the highest passing stage in separately bounded runs. Require capacity above the expected launch peak, with at least 50% headroom; 50 virtual users alone does not establish a universal launch limit.
- Save the deployment commit, service plans, regions, dataset sizes, stage report and database observations together. Fix the first bottleneck, then repeat the failing stage and the preceding passing stage.

## Generation is a separate test

The supplied runner performs reads only and does not call paid generation or payment APIs. For streaming capacity, use the existing test-provider mechanism only in an isolated staging project, with realistic first-token delay and stream duration. Exercise one request per user, same-wallet contention, cancellation, reconnects and long histories. Verify exactly one charge per request and compare quoted limits with recorded usage.

After the synthetic streaming run, perform a small separately budgeted real-provider smoke test, including image input, image output, low balances and interrupted requests. Reconcile actual provider usage against configured prices. This is required to validate provider pricing and media-count contracts; local mocks and an HTTP read benchmark cannot establish those guarantees.

## Reproducing the full functional suite locally

Prepare a disposable local PostgreSQL database named `khasigpt_audit_*` with the application schema and migrations. Install Playwright Chromium with `pnpm exec playwright install chromium`, set `AUDIT_DATABASE_URL` to that database, then run `pnpm test:isolated --retries=0 --reporter=list`.

The runner rejects remote/non-audit databases, shadows local service credentials, starts a jobs HTTP fixture over the local SQL data and uses a separate Next.js output directory and port 3100. It uses Turbopack, matching the production build pipeline; the Webpack development server on this Windows installation was observed reading a partially written manifest in `load-manifest.external.js` before reaching route authorization. No test changes the production authorization rules to bypass that failure. Existing intentionally skipped tests remain reported as skips.
