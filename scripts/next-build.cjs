const { spawnSync } = require("node:child_process");
const path = require("node:path");

if (!process.env.NEXT_TRACE_SPAN_THRESHOLD_MS) {
  process.env.NEXT_TRACE_SPAN_THRESHOLD_MS = "999999999";
}

const nextBin = path.join(
  __dirname,
  "..",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
