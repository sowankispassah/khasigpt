const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const nextBin = path.join(
  workspaceRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);
const lockPath = path.join(workspaceRoot, ".next", "dev", "lock");

function normalizeProcessList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function listWorkspaceNextProcesses() {
  try {
    if (process.platform === "win32") {
      const script = [
        "$root = $env:NEXT_DEV_WORKSPACE_ROOT",
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" |",
        "  Where-Object {",
        "    $_.CommandLine -and",
        "    $_.CommandLine.Contains($root) -and",
        "    ($_.CommandLine -like '*next dev*' -or $_.CommandLine -like '*start-server.js*')",
        "  } |",
        "  Select-Object ProcessId, CommandLine |",
        "  ConvertTo-Json -Compress",
      ].join("\n");

      const stdout = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        {
          cwd: workspaceRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            NEXT_DEV_WORKSPACE_ROOT: workspaceRoot,
          },
          stdio: ["ignore", "pipe", "ignore"],
        }
      ).trim();

      return normalizeProcessList(stdout ? JSON.parse(stdout) : []);
    }

    const stdout = execFileSync("ps", ["-ax", "-o", "pid=,command="], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const firstSpace = line.indexOf(" ");
        return {
          ProcessId:
            firstSpace === -1
              ? Number.parseInt(line, 10)
              : Number.parseInt(line.slice(0, firstSpace), 10),
          CommandLine: firstSpace === -1 ? "" : line.slice(firstSpace + 1),
        };
      })
      .filter(
        (entry) =>
          Number.isFinite(entry.ProcessId) &&
          entry.CommandLine.includes(workspaceRoot) &&
          (entry.CommandLine.includes("next dev") ||
            entry.CommandLine.includes("start-server.js"))
      );
  } catch {
    return [];
  }
}

function ensureStaleLockIsCleared() {
  const workspaceNextProcesses = listWorkspaceNextProcesses().filter(
    (entry) => entry.ProcessId !== process.pid
  );

  if (workspaceNextProcesses.length > 0) {
    const details = workspaceNextProcesses
      .map(
        (entry) =>
          `- PID ${entry.ProcessId}: ${String(entry.CommandLine || "").trim()}`
      )
      .join("\n");

    console.error(
      [
        "Another Next.js dev server for this workspace is still running.",
        "Terminate it before starting a new one.",
        details,
      ].join("\n")
    );
    process.exit(1);
  }

  if (!fs.existsSync(lockPath)) {
    return;
  }

  fs.rmSync(lockPath, { force: true });
  console.log(`Removed stale Next.js dev lock at ${lockPath}`);
}

ensureStaleLockIsCleared();

const args = process.argv.slice(2);
const child = spawn(process.execPath, [nextBin, "dev", ...args], {
  cwd: workspaceRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
