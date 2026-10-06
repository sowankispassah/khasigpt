// Poll only read-only history while the server finishes its final checkpoint.
// Closing a client never triggers another provider request or another charge.
export async function confirmVoiceHistory<T extends { pending?: boolean }>(read: () => Promise<T>, pendingMessage = "Unable to save this voice chat.") {
  const deadline = Date.now() + 15000;
  for (;;) {
    const snapshot = await read();
    if (!snapshot.pending) return snapshot;
    if (Date.now() >= deadline) throw new Error(pendingMessage);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
