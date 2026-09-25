import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

// Usage: node scripts/load-test.mjs path/to/private-config.json
// Tokens belong to disposable staging users; never put the config in git.
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const target = new URL(config.target);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
if (/(^|\.)khasigpt\.com$/.test(target.hostname) || target.hostname === 'khasigpt.vercel.app') throw new Error('Public production is excluded from this load runner');
if (!local && (!config.stagingConfirmed || target.protocol !== 'https:')) throw new Error('Explicit stagingConfirmed and HTTPS are required');
const stages = config.stages ?? [5, 10, 25, 50];
const seconds = config.secondsPerStage ?? 60;
const users = config.tokens ?? [];
if (!Array.isArray(stages) || stages.length < 1 || stages.length > 6 || stages.some(v => !Number.isInteger(v) || v < 1 || v > 50) || !Number.isInteger(seconds) || seconds < 5 || seconds > 180) throw new Error('Stages must be 1–50 users, 5–180 seconds each, at most six stages');
if (users.length < Math.max(...stages) || users.some(token => typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token))) throw new Error('Provide one mobile bearer token per staging virtual user');
const paths = ['/api/mobile/bootstrap', '/api/history?limit=20', '/api/jobs/list'];
const measurements = [];
let requests = 0;
let stopped = false;
let failed = false;
const stageResults = [];
function summarize(rows) {
  const times = rows.map(row => row.ms).sort((a, b) => a - b);
  const percentile = p => times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)] ?? 0;
  return { requests: rows.length, errors: rows.filter(row => !row.ok).length, p50: Math.round(percentile(.5)), p95: Math.round(percentile(.95)), p99: Math.round(percentile(.99)) };
}
for (const concurrency of stages) {
  const started = performance.now();
  const stageRows = [];
  await Promise.all(Array.from({ length: concurrency }, async (_, user) => {
    let iteration = 0;
    while (!stopped && performance.now() - started < seconds * 1000) {
      if (requests++ >= 5000) { stopped = true; break; }
      const endpoint = paths[iteration++ % paths.length];
      const before = performance.now();
      let status = 0;
      let ok = false;
      try {
        const response = await fetch(new URL(endpoint, target), { headers: { Authorization: `Bearer ${users[user]}` }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
        status = response.status;
        const body = await response.json();
        // Degraded HTTP 200s and redirects to login are failures, not capacity.
        ok = status === 200 && body?.meta?.degraded !== true && body?.degraded !== true && !(body?.meta?.degradedSections?.length > 0);
        if (endpoint === '/api/mobile/bootstrap' && !body?.session?.user?.id) ok = false;
      } catch { /* Record a failure without exposing request headers or bodies. */ }
      const row = { endpoint, status, ok, ms: performance.now() - before };
      stageRows.push(row);
      measurements.push(row);
      const recent = stageRows.slice(-100);
      if (recent.length >= 20 && (recent.filter(item => !item.ok).length / recent.length > .05 || summarize(recent).p95 > 10000)) stopped = true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }));
  const summary = { concurrency, seconds: Math.round((performance.now() - started) / 1000), ...summarize(stageRows), stopped };
  summary.requestsPerSecond = Math.round(summary.requests / Math.max(1, summary.seconds) * 100) / 100;
  failed ||= summary.requests === 0 || summary.errors / summary.requests > .01 || summary.p95 > 2500;
  stageResults.push(summary);
  console.log(JSON.stringify(summary));
  if (stopped) break;
}
const summary = summarize(measurements);
const report = { target: target.origin, kind: 'authenticated HTTP read load; excludes paid generation', stages: stageResults, ...summary, stopped, endpoints: Object.fromEntries(paths.map(endpoint => [endpoint, summarize(measurements.filter(row => row.endpoint === endpoint))])) };
await writeFile(config.output ?? 'tmp/http-load-report.json', JSON.stringify(report, null, 2));
if (stopped || failed) process.exitCode = 1;
