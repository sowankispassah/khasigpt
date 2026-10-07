import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function runSourceScript(apply: boolean) {
  const saved: any[] = [];
  const output: string[] = [];
  let sequence = 0;
  const code = ts.transpileModule(readFileSync(new URL("../../scripts/add-meghalaya-job-sources.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: {},
    crypto: { randomUUID: () => `source-${++sequence}` },
    process: { argv: apply ? ["--apply"] : [] },
    console: { log: (message: string) => output.push(message), error: (message: string) => { throw new Error(message); } },
    require(name: string) {
      if (name === "@/config/jobSources") return { jobSources: [{ name: "Existing LinkedIn", url: "https://linkedin.com/jobs" }] };
      assert.equal(name, "@/lib/jobs/source-registry");
      return {
        listManagedJobSources: async (options: unknown) => { assert.equal((options as { uncached: boolean }).uncached, true); return []; },
        saveManagedJobSources: async (sources: unknown) => saved.push(sources),
      };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { saved, summary: JSON.parse(output[0]) };
}

test("the source utility defaults to a dry run without writing settings", async () => {
  const result = await runSourceScript(false);
  assert.equal(result.saved.length, 0);
  assert.equal(result.summary.dryRun, true);
  assert.equal(result.summary.added, 0);
  assert.ok(result.summary.proposed > 0);
});

test("explicit source application keeps new government sources disabled and preserves LinkedIn fallback", async () => {
  const result = await runSourceScript(true);
  assert.equal(result.saved.length, 1);
  assert.equal(result.summary.dryRun, false);
  assert.equal(result.saved[0][0].enabled, true);
  assert.ok(result.saved[0].slice(1).every((source: { enabled: boolean }) => !source.enabled));
});
