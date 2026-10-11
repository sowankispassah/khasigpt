// Live has no completed-turn event. Keep both speakers independent, and start
// a new bubble when that speaker resumes after a gap in the session timeline.
export type DurationTranscriptMessage = { id: string; role: "user" | "assistant"; text: string; voiceSessionId?: string; transcriptEndMs?: number };
export function appendDurationTranscript(messages: DurationTranscriptMessage[], event: { type: string; delta?: unknown; start_ms?: unknown; end_ms?: unknown }, sessionId: string): DurationTranscriptMessage[] {
  const role = event.type === "session.input_transcript.delta" ? "user" : event.type === "session.output_transcript.delta" ? "assistant" : null;
  if (!role || typeof event.delta !== "string") return messages;
  let index = messages.length - 1;
  while (index >= 0 && messages[index]?.role !== role) index--;
  const last = messages[index];
  const start = typeof event.start_ms === "number" ? event.start_ms : 0;
  const end = typeof event.end_ms === "number" ? event.end_ms : start;
  // A reply after a newer caller bubble must not merge back into an earlier
  // greeting: that puts every assistant fragment before the question.
  const newerCaller = role === "assistant" && messages.slice(index + 1).some(message => message.role === "user");
  if (last && !newerCaller && start - (last.transcriptEndMs ?? start) < 1500) {
    return messages.map((message, i) => i === index ? { ...message, text: message.text + event.delta, transcriptEndMs: end } : message);
  }
  return [...messages, { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, role, text: event.delta, voiceSessionId: sessionId, transcriptEndMs: end }];
}

// A full-duplex greeting can arrive while the caller is still speaking.
// Preserve every assistant bubble until the next caller message rather than
// consuming the caller as soon as the first assistant fragment appears.
export function groupDurationVoicePairs(messages: DurationTranscriptMessage[]) {
  const pairs: Array<{ userText: string; assistantText: string; userSourceId: string; assistantSourceId: string; voiceSessionId: string }> = [];
  let user: DurationTranscriptMessage | undefined;
  let assistants: DurationTranscriptMessage[] = [];
  const flush = () => {
    const last = assistants.at(-1);
    if (user?.text.trim() && last && user.voiceSessionId) pairs.push({ userText: user.text.trim(), assistantText: assistants.map(message => message.text.trim()).filter(Boolean).join(" "), userSourceId: user.id, assistantSourceId: last.id, voiceSessionId: user.voiceSessionId });
  };
  for (const message of messages) {
    if (!message.text.trim()) continue;
    if (message.role === "user") { flush(); user = message; assistants = []; }
    else if (user) assistants.push(message);
  }
  flush();
  return pairs;
}
