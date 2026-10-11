// Shared web/native transport adapter. Only audio and stream-end commands are
// uploaded; configuration, knowledge tools and metering stay on the server.
export type RelayIO = {
  stream: (body: object, onLine: (line: string) => void, signal: AbortSignal) => Promise<void>;
  upload: (body: object) => Promise<void>;
};
export class VoiceRelaySocket {
  readyState = 0;
  binaryType = "arraybuffer";
  sessionId: string | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { reason: string }) => void) | null = null;
  private pending: object[] = [];
  private abort = new AbortController();
  private timer: ReturnType<typeof setInterval>;
  private uploading = false;
  private heartbeatAt = Date.now();
  constructor(private io: RelayIO) {
    this.timer = setInterval(() => { void this.flush(); }, 200);
    // Let callers attach event handlers before even a mocked stream resolves.
    Promise.resolve().then(() => io.stream({}, line => {
      const event = JSON.parse(line);
      if (event.relayStarted?.sessionId) {
        this.sessionId = event.relayStarted.sessionId;
        this.readyState = 1;
        this.onopen?.();
      } else this.onmessage?.({ data: line });
    }, this.abort.signal)).then(() => this.finish(), () => {
      if (this.readyState < 2) this.onerror?.();
      this.finish();
    });
  }
  send(raw: string) {
    if (this.readyState !== 1) return;
    const message = JSON.parse(raw);
    if (!message.realtimeInput?.audio && !message.realtimeInput?.audioStreamEnd) return;
    if (this.pending.length >= 64) { this.onerror?.(); this.close(); return; }
    this.pending.push(message);
  }
  private async flush() {
    if (this.uploading || this.readyState !== 1 || !this.sessionId || (!this.pending.length && Date.now() - this.heartbeatAt < 5000)) return;
    this.uploading = true;
    const messages = this.pending.splice(0, 32);
    this.heartbeatAt = Date.now();
    try { await this.io.upload({ sessionId: this.sessionId, messages }); }
    catch { this.onerror?.(); this.close(); }
    finally { this.uploading = false; }
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    clearInterval(this.timer);
    if (this.sessionId) void this.io.upload({ sessionId: this.sessionId, close: true }).catch(() => undefined);
    this.abort.abort();
    this.finish();
  }
  private finish() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearInterval(this.timer);
    this.onclose?.({ reason: "" });
  }
}
