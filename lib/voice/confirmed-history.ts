// Poll only read-only history while the server finishes its final checkpoint.
// Closing a client never triggers another provider request or another charge.
export class VoiceHistoryReadError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export async function confirmVoiceHistory<T extends { pending?: boolean }>(read: () => Promise<T>, pendingMessage = "Unable to save this voice chat.") {
  const deadline = Date.now() + 15000;
  let failures = 0;
  for (;;) {
    let snapshot: T;
    try { snapshot = await read(); }
    catch (error) {
      const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
      const transient = status === undefined || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!transient || failures++ >= 1 || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }
    if (!snapshot.pending) return snapshot;
    if (Date.now() >= deadline) throw new Error(pendingMessage);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
