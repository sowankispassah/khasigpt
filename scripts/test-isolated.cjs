const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { parse } = require('dotenv');
const postgres = require('postgres');
const { startJobsService } = require('../tests/support/jobs-service.cjs');

async function main() {
  const databaseUrl = process.env.AUDIT_DATABASE_URL;
  const parsed = new URL(databaseUrl || 'http://invalid');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !parsed.pathname.startsWith('/khasigpt_audit_')) {
    throw new Error('AUDIT_DATABASE_URL must name a disposable local khasigpt_audit_ database with the application schema applied');
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:KEY|TOKEN|SECRET|DATABASE|POSTGRES|REDIS)/i.test(key)) env[key] = '';
  }
  // Shadow every local secret. dotenv's default loading cannot override these.
  for (const file of ['.env', '.env.local']) {
    if (fs.existsSync(file)) {
      for (const key of Object.keys(parse(fs.readFileSync(file)))) env[key] = '';
    }
  }
  for (const key of ['POSTGRES_URL', 'DATABASE_URL', 'POSTGRES_POOLER_URL', 'POSTGRES_DIRECT_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_AUTH_URL', 'POSTGRES_ADMIN_URL', 'POSTGRES_CHAT_READ_URL']) env[key] = databaseUrl;
  const sql = postgres(databaseUrl, { max: 2 });
  const fixtureKey = 'isolated-jobs-fixture';
  const jobs = await startJobsService(sql, fixtureKey);
  const port = process.env.AUDIT_HTTP_PORT || '3100';
  Object.assign(env, {
    ISOLATED_TEST_RUN: '1', AUTH_SECRET: 'isolated-audit-test-secret', NEXTAUTH_SECRET: 'isolated-audit-test-secret',
    AUTH_TRUST_HOST: 'true', NEXTAUTH_URL: `http://localhost:${port}`, AUTH_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, PLAYWRIGHT: 'true', PORT: port,
    NEXT_DIST_DIR: '.next-isolated-tests', SKIP_APP_SETTING_CACHE: '1', SKIP_TRANSLATION_CACHE: '1',
    BYPASS_SITE_STATUS_GATE_IN_DEV: 'true', SUPABASE_URL: jobs.url, SUPABASE_SERVICE_ROLE_KEY: fixtureKey,
  });
  try {
    // public.jobs is intentionally maintained by SQL migrations, outside the
    // Drizzle schema generator used to prepare some disposable databases.
    for (const migration of ['0049_jobs_table.sql', '0050_jobs_status.sql', '0053_jobs_pdf_cache.sql', '0054_jobs_scraper_reliability.sql']) {
      await sql.unsafe(fs.readFileSync(`lib/db/migrations/${migration}`, 'utf8'));
    }
    await sql`insert into language (code,name,"isDefault","isActive","syncUiLanguage") values ('en','English',true,true,true),('kha','Khasi',false,true,true) on conflict (code) do nothing`;
    const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  } finally {
    await jobs.close();
    await sql.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
