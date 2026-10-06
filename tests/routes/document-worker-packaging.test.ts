import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { docxFixture, pdfFixture } from "../support/attachment-fixtures";

test("traced upload package parses PDF and DOCX without the source node_modules", async () => {
  test.skip(
    process.env.ISOLATED_TEST_SERVER !== "production",
    "Requires the isolated production build.",
  );
  const root = process.cwd();
  const trace = path.join(
    root,
    ".next-isolated-tests/server/app/(chat)/api/files/upload/route.js.nft.json",
  );
  const files: string[] = JSON.parse(readFileSync(trace, "utf8")).files.map(
    (file: string) => path.resolve(path.dirname(trace), file),
  );
  // Leave headroom below the host's 250 MB function limit. The former broad
  // parser globs added duplicate browser builds and exceeded this trace budget.
  const traceBytes = files.reduce(
    (total, file) => total + statSync(file).size,
    0,
  );
  expect(traceBytes).toBeLessThan(160 * 1024 * 1024);
  const prefix = path.join(os.tmpdir(), "khasigpt-document-package-");
  const stage = mkdtempSync(prefix);
  // Deliberately stage outside the repo: missing dependencies must not resolve
  // through a parent directory's development node_modules. Never copy secrets.
  const links: Array<{ source: string; real: string }> = [];
  const destination = (source: string) => {
    expect(source.startsWith(`${root}${path.sep}`)).toBe(true);
    expect(path.basename(source)).not.toMatch(/^\.env(?:\.|$)/);
    return path.join(stage, path.relative(root, source));
  };
  const copy = (source: string, target: string) => {
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  };
  try {
    for (const source of files) {
      const info = lstatSync(source);
      if (statSync(source).isFile()) {
        copy(source, destination(source));
        copy(source, destination(realpathSync(source)));
      } else if (info.isSymbolicLink())
        links.push({ source, real: realpathSync(source) });
    }
    // Preserve traced package aliases, with every target inside this temporary
    // package. Flattening pnpm aliases changes Node's dependency lookup paths.
    for (const link of links) {
      const alias = destination(link.source);
      const target = destination(link.real);
      if (existsSync(alias)) {
        expect(realpathSync(alias).startsWith(`${stage}${path.sep}`)).toBe(
          true,
        );
        rmSync(alias, { recursive: true, force: true });
      }
      mkdirSync(path.dirname(alias), { recursive: true });
      mkdirSync(target, { recursive: true });
      symlinkSync(target, alias, "junction");
    }
    // Expose failures only in this fixture-only copy; parsing stays identical.
    const stagedWorker = path.join(stage, "scripts/chat-document-worker.cjs");
    writeFileSync(
      stagedWorker,
      readFileSync(stagedWorker, "utf8").replace(
        ".catch(() => {",
        ".catch(error => { console.error(error);",
      ),
    );
    for (const [buffer, mediaType] of [
      [pdfFixture(), "application/pdf"],
      [
        docxFixture(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    ] as const) {
      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--max-old-space-size=128",
            path.join(stage, "scripts/chat-document-worker.cjs"),
          ],
          {
            cwd: stage,
            env: { NODE_ENV: "production", SystemRoot: process.env.SystemRoot },
            serialization: "advanced",
            stdio: ["ignore", "ignore", "pipe", "ipc"],
            windowsHide: true,
          },
        );
        let result: string | undefined;
        let diagnostics = "";
        child.stderr?.on("data", (data) => {
          diagnostics = (diagnostics + data.toString()).slice(0, 3000);
        });
        const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
        child.once("message", (message: unknown) => {
          if (
            message &&
            typeof message === "object" &&
            "text" in message &&
            typeof message.text === "string"
          )
            result = message.text;
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          clearTimeout(timer);
          if (result) resolve(result);
          else
            reject(
              new Error(
                `Traced worker failed: exit=${code}, signal=${signal}, type=${mediaType}. ${diagnostics}`,
              ),
            );
        });
        child.send({ buffer, mediaType, maxTextChars: 32000 });
      });
      expect(text).toContain("KhasiGPT");
    }
  } finally {
    if (
      path.resolve(stage).startsWith(prefix) &&
      realpathSync(stage) === path.resolve(stage)
    ) {
      rmSync(stage, { recursive: true, force: true });
    } else {
      console.warn("Skipped unsafe package cleanup path.");
    }
  }
});
