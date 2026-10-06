"use client";
import { appendDurationTranscript } from "@/lib/voice/duration-transcripts";
import { LiveSessionError } from "@/lib/voice/session-errors";
import type { WebGeminiVoiceCallbacks, WebGeminiVoiceConversationMessage, WebGeminiVoiceTurnController } from "@/lib/voice/web-live-voice";
import { WebVoiceTokenError } from "@/lib/voice/web-live-voice";

export async function startDurationWebVoice(callbacks: WebGeminiVoiceCallbacks, endpoint: string): Promise<WebGeminiVoiceTurnController> {
  const peer = new RTCPeerConnection();
  const events = peer.createDataChannel("oai-events");
  const audio = new Audio();
  audio.autoplay = true;
  let microphone: MediaStream | null = null;
  let messages: WebGeminiVoiceConversationMessage[] = [];
  let sessionId = "";
  let ready = false;
  let closed = false;
  let stopping = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let context: AudioContext | undefined;
  let resolveClosed: (() => void) | undefined;
  const finished = new Promise<void>(resolve => { resolveClosed = resolve; });
  let rejectReady: ((error: Error) => void) | undefined;
  let resolveReady: (() => void) | undefined;
  const connected = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  connected.catch(() => undefined);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer); clearTimeout(readyTimer); clearInterval(levelTimer);
    microphone?.getTracks().forEach(track => { track.stop(); });
    events.close(); peer.close(); audio.srcObject = null;
    void context?.close(); callbacks.onInputLevel?.(0); resolveClosed?.();
  };
  const fail = () => {
    const error = new LiveSessionError("live_connection_failed");
    rejectReady?.(error); callbacks.onError?.(error); cleanup();
  };
  const requestClose = () => {
    if (closed || stopping) return;
    stopping = true;
    microphone?.getTracks().forEach(track => { track.enabled = false; });
    if (events.readyState === "open") events.send(JSON.stringify({ type: "session.close" }));
    closeTimer = setTimeout(fail, 15_000);
  };
  peer.ontrack = event => { audio.srcObject = new MediaStream([event.track]); void audio.play().catch(fail); };
  peer.onconnectionstatechange = () => { if (peer.connectionState === "failed") fail(); };
  events.onclose = () => { if (!closed) fail(); };
  events.onmessage = event => {
    let data: Record<string, any>;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "session.started") { ready = true; clearTimeout(readyTimer); callbacks.onStatus?.("listening"); resolveReady?.(); }
    if (data.type === "session.input_transcript.delta" || data.type === "session.output_transcript.delta") {
      messages = appendDurationTranscript(messages, data as { type: string }, sessionId);
      callbacks.onMessages?.(messages.map(message => ({ ...message })));
      const message = messages.at(-1);
      if (message?.role === "user") { callbacks.onUserTranscript?.(message.text); callbacks.onStatus?.("listening"); }
      else if (message) { callbacks.onAssistantTranscript?.(message.text); callbacks.onStatus?.("speaking"); }
    }
    if (data.type === "session.delegation.created") callbacks.onStatus?.("thinking");
    if (data.type === "session.closed") {
      if (!ready) rejectReady?.(new LiveSessionError("live_connection_failed"));
      if (ready && !stopping) { if (callbacks.onCompletedSession) { callbacks.onCompletedSession(messages); messages = []; } callbacks.onError?.(new LiveSessionError("live_session_ended")); }
      cleanup();
    }
    if (data.type === "error") { requestClose(); fail(); }
  };
  try {
    microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    for (const track of microphone.getAudioTracks()) peer.addTrack(track, microphone);
    context = new AudioContext();
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(microphone).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    levelTimer = setInterval(() => { analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length); callbacks.onInputLevel?.(Math.min(1, rms * 6)); }, 80);
    await peer.setLocalDescription(await peer.createOffer());
    if (peer.iceGatheringState !== "complete") await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { peer.removeEventListener("icegatheringstatechange", check); reject(new Error("KhasiGPT voice chat could not connect.")); }, 10_000);
      const check = () => { if (peer.iceGatheringState === "complete") { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", check); resolve(); } };
      peer.addEventListener("icegatheringstatechange", check); check();
    });
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sdp: peer.localDescription?.sdp }), signal: AbortSignal.timeout(25_000) });
    if (!response.ok) { if (response.status === 402) throw new WebVoiceTokenError("Insufficient credits remaining", 402, "insufficient-credits"); throw new LiveSessionError("live_connection_failed"); }
    const result = await response.json();
    sessionId = result.sessionId;
    readyTimer = setTimeout(fail, 15_000);
    await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
    await connected;
    return { serverMetered: true, getMessages: () => messages.map(message => ({ ...message })), cancel: requestClose, stop: async () => { requestClose(); await finished; return { messages }; } };
  } catch (error) { requestClose(); cleanup(); throw error; }
}
