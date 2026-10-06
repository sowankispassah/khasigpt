import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

type TextResult = { text: string; truncated: boolean };
const MAX_TEXT_CHARS = 32_000;
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { value: TextResult; expiresAt: number }>();
let active = 0;

export async function extractChatDocument({
  ownerId,
  name,
  buffer,
  mediaType,
}: {
  ownerId: string;
  name?: string | null;
  buffer: Buffer;
  mediaType: string;
}) {
  if (!buffer.length || buffer.byteLength > 5 * 1024 * 1024)
    throw new Error("Document size limit.");
  const key = createHash("sha256")
    .update(ownerId)
    .update(mediaType)
    .update(buffer)
    .digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return { ...cached.value, name: name?.trim() || "document" };
  if (active >= 2) throw new Error("Document parser busy.");
  active++;
  try {
    const result = await new Promise<TextResult>((resolve, reject) => {
      // Explicit Node + IPC avoids Turbopack treating fork's filename as an import.
      const worker = spawn(
        process.execPath,
        [
          "--max-old-space-size=128",
          path.join(process.cwd(), "scripts/chat-document-worker.cjs"),
        ],
        {
          // A native parser crash must not take down the request process. Give
          // this child no app secrets, a bounded heap, and a terminating deadline.
          env:
            process.platform === "win32"
              ? { NODE_ENV: "production", SystemRoot: process.env.SystemRoot }
              : { NODE_ENV: "production" },
          serialization: "advanced",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          windowsHide: true,
        },
      );
      let finished = false;
      let exitObserved = false;
      const finish = (value?: TextResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        const settle = () =>
          value
            ? resolve(value)
            : reject(new Error("Unable to read document."));
        if (exitObserved) settle();
        else {
          worker.once("exit", settle);
          worker.kill("SIGKILL");
        }
      };
      const timer = setTimeout(() => finish(), 15_000);
      worker.once("message", (message: unknown) => {
        if (!message || typeof message !== "object") {
          finish();
          return;
        }
        const value = message as { text?: unknown; truncated?: unknown };
        if (
          typeof value?.text !== "string" ||
          value.text.length > MAX_TEXT_CHARS ||
          typeof value.truncated !== "boolean"
        )
          finish();
        else finish({ text: value.text, truncated: value.truncated });
      });
      worker.once("error", () => {
        if (!worker.pid) exitObserved = true;
        finish();
      });
      worker.once("exit", () => {
        exitObserved = true;
        finish();
      });
      try {
        // Static resolve calls keep package aliases in Next's runtime trace
        // without loading native parser libraries into the request process.
        worker.send({
          buffer,
          mediaType,
          maxTextChars: MAX_TEXT_CHARS,
          tracedDependencies: {
            pdf: require.resolve("pdf-parse"),
            docx: require.resolve("mammoth"),
            canvas: require.resolve("@napi-rs/canvas"),
          },
        });
      } catch {
        finish();
      }
    });
    for (const [entryKey, value] of cache)
      if (value.expiresAt <= Date.now()) cache.delete(entryKey);
    if (cache.size >= 16) cache.delete(cache.keys().next().value as string);
    cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ...result, name: name?.trim() || "document" };
  } finally {
    active--;
  }
}
