// Live has no completed-turn event. Keep both speakers independent, and start
// a new bubble when that speaker resumes after a gap in the session timeline.
export type DurationTranscriptMessage = { id: string; role: "user" | "assistant"; text: string; voiceSessionId?: string; transcriptEndMs?: number };
export function appendDurationTranscript(messages: DurationTranscriptMessage[], event: { type: string; delta?: unknown; start_ms?: unknown; end_ms?: unknown }, sessionId: string): DurationTranscriptMessage[] {
  const role = event.type === "session.input_transcript.delta" ? "user" : event.type === "session.output_transcript.delta" ? "assistant" : null;
  if (!role || typeof event.delta !== "string") return messages;
  const index = messages.findLastIndex(message => message.role === role);
  const last = messages[index];
  const start = typeof event.start_ms === "number" ? event.start_ms : 0;
  const end = typeof event.end_ms === "number" ? event.end_ms : start;
  if (last && start - (last.transcriptEndMs ?? start) < 1500) {
    return messages.map((message, i) => i === index ? { ...message, text: message.text + event.delta, transcriptEndMs: end } : message);
  }
  return [...messages, { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, role, text: event.delta, voiceSessionId: sessionId, transcriptEndMs: end }];
}
