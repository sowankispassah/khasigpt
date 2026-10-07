import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as duplicateMatch from "../../lib/jobs/duplicate-match";

const posting = {
  title: "Assistant Engineer",
  company: "Meghalaya Energy Corporation",
  location: "Shillong",
  description: "Advertisement No. MEECL/REC/2026-09. Applications are invited for Assistant Engineer posts.",
  source_url: "https://example.gov.in/new",
  status: "active",
};
const pdf = {
  pdf_source_url: "https://example.gov.in/jobs.pdf",
  pdf_cached_url: "https://cache.example/jobs.pdf",
  pdf_content: "Confirmed PDF text",
};

function harness(existing: Record<string, any>[] = [], failContext = false) {
  const rows = existing.map((row) => ({ ...row }));
  const operations: Array<{ kind: string; columns: string }> = [];
  const rag: Array<{ jobIds: string[] }> = [];
  let sequence = 0;
  class Query {
    columns = "";
    kind = "select";
    predicates: Array<(row: any) => boolean> = [];
    payload: any;
    options: any;
    select(columns: string) { this.columns = columns; return this; }
    in(column: string, values: unknown[]) { this.predicates.push((row) => values.includes(row[column])); return this; }
    eq(column: string, value: unknown) { this.predicates.push((row) => row[column] === value); return this; }
    limit() { return this; }
    update(payload: any) { this.kind = "update"; this.payload = payload; return this; }
    upsert(payload: any, options: any) { this.kind = "upsert"; this.payload = payload; this.options = options; return this; }
    async execute() {
      operations.push({ kind: this.kind, columns: this.columns });
      if (failContext && this.columns.startsWith("id,source_url,title")) return { data: null, error: { message: "Candidate lookup failed" } };
      const matches = rows.filter((row) => this.predicates.every((predicate) => predicate(row)));
      if (this.kind === "update") { for (const row of matches) Object.assign(row, this.payload); return { data: null, error: null }; }
      if (this.kind === "upsert") {
        const written = [];
        for (const input of this.payload) {
          let row = rows.find((candidate) => candidate.source_url === input.source_url);
          if (row && this.options.ignoreDuplicates) continue;
          if (row) Object.assign(row, input);
          else {
            const created: Record<string, any> = { ...input, id: `inserted-${++sequence}` };
            rows.push(created);
            row = created;
          }
          written.push({ id: row.id, source_url: row.source_url });
        }
        return { data: written, error: null };
      }
      return { data: matches.map((row) => ({ ...row })), error: null };
    }
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable; the mock follows that API.
    then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }
  }
  const code = ts.transpileModule(readFileSync(new URL("../../lib/jobs/saveJobs.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/jobs/duplicate-match": duplicateMatch,
    "@/lib/jobs/location": { DEFAULT_JOB_LOCATION: "Meghalaya" },
    "@/lib/jobs/rag-sync": { syncJobPostingsToRag: async (input: { jobIds: string[] }) => { rag.push(input); } },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => ({ from: () => new Query() }) },
  };
  vm.runInNewContext(code, {
    exports, console: { warn() {} }, setTimeout: (callback: () => void) => { callback(); },
    require(name: string) { assert.ok(name in mocks, name); return mocks[name]; },
  });
  return { rows, operations, rag, saveJobs: exports.saveJobs };
}

test("cross-source duplicates backfill the existing PDF and refresh its RAG entry", async () => {
  const h = harness([{ ...posting, id: "existing", source_url: "https://example.gov.in/original" }]);
  const result = await h.saveJobs([{ ...posting, ...pdf }]);
  assert.equal(result.insertedCount, 0);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedDuplicateCount, 1);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].pdf_content, pdf.pdf_content);
  assert.deepEqual(Array.from(h.rag[0].jobIds), ["existing"]);
  assert.ok(h.operations.filter((operation) => operation.columns.includes("pdf_content")).every((operation) => operation.columns.startsWith("id,pdf_source_url")));
});

test("duplicates in one batch retain the later PDF without inserting a second job", async () => {
  const h = harness();
  const result = await h.saveJobs([posting, { ...posting, ...pdf, source_url: "https://example.gov.in/second" }], { syncRag: false });
  assert.equal(result.insertedCount, 1);
  assert.equal(result.skippedDuplicateCount, 1);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].pdf_content, pdf.pdf_content);
});

test("update mode still updates its own source and preserves inactive jobs", async () => {
  const h = harness([
    { ...posting, id: "own", status: "inactive" },
    { ...posting, id: "other", source_url: "https://example.gov.in/other" },
  ]);
  const result = await h.saveJobs([{ ...posting, ...pdf }], { onDuplicate: "update", syncRag: false });
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedDuplicateCount, 0);
  assert.equal(h.rows[0].status, "inactive");
  assert.equal(h.rows[0].pdf_content, pdf.pdf_content);
});

test("different roles in one PDF stay separate", async () => {
  const h = harness([{ ...posting, ...pdf, title: "Assistant Engineer Civil", id: "civil" }]);
  const result = await h.saveJobs([{ ...posting, ...pdf, title: "Assistant Engineer Electrical", source_url: "https://example.gov.in/electrical" }], { syncRag: false });
  assert.equal(result.insertedCount, 1);
  assert.equal(h.rows.length, 2);
});

test("failed duplicate reads stop writes rather than reporting a successful insert", async () => {
  const h = harness([], true);
  await assert.rejects(h.saveJobs([posting], { syncRag: false }), /Candidate lookup failed/);
  assert.ok(h.operations.every((operation) => operation.kind === "select"));
  assert.equal(h.rows.length, 0);
});
