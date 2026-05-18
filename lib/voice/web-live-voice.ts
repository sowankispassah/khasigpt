"use client";

import type { GeminiVoiceTokenResponse } from "@/lib/voice/live";

export type WebGeminiVoiceTurnStatus =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export type WebGeminiVoiceTurnResult = {
  assistantText: string;
  userText: string;
};

export type WebGeminiVoiceTurnController = {
  cancel: () => void;
  stop: () => Promise<WebGeminiVoiceTurnResult>;
};

type WebGeminiVoiceCallbacks = {
  onAssistantTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
  onStatus?: (status: WebGeminiVoiceTurnStatus) => void;
  onUserTranscript?: (text: string) => void;
};

const LIVE_SETUP_TIMEOUT_MS = 15_000;
const TURN_RESULT_TIMEOUT_MS = 30_000;
const PROCESSOR_BUFFER_SIZE = 4096;

function appendTranscript(current: string, next: unknown) {
  if (typeof next !== "string" || !next.trim()) {
    return current;
  }
  const normalized = next.replace(/\s+/g, " ").trim();
  if (!current.trim()) {
    return normalized;
  }
  if (current.endsWith(normalized)) {
    return current;
  }
  if (normalized.toLowerCase().startsWith(current.trim().toLowerCase())) {
    return normalized;
  }
  return `${current} ${normalized}`.trim();
}

function parseServerMessage(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }
  try {
    return JSON.parse(data) as Record<string, any>;
  } catch {
    return null;
  }
}

function buildSetupMessage(model: string) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        temperature: 0.7,
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
        automaticActivityDetection: {
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 120,
          silenceDurationMs: 500,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        },
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      systemInstruction: {
        parts: [
          {
            text: [
              "You are KhasiGPT in web voice chat.",
              "The user is speaking by microphone and expects a natural spoken reply.",
              "Answer conversationally and keep responses concise unless the user asks for detail.",
              "Support Khasi and English naturally. If the user speaks Khasi, respond in Khasi unless they request another language.",
            ].join("\n"),
          },
        ],
      },
    },
  };
}

function floatToPcm16Base64(input: Float32Array, sourceRate: number, targetRate: number) {
  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(index * ratio));
    const sample = Math.max(-1, Math.min(1, input[sourceIndex] ?? 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64Pcm16ToAudioBuffer({
  audioContext,
  base64Audio,
  sampleRate,
}: {
  audioContext: AudioContext;
  base64Audio: string;
  sampleRate: number;
}) {
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const pcm = new Int16Array(bytes.buffer);
  const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = (pcm[index] ?? 0) / 0x8000;
  }
  return buffer;
}

async function requestVoiceToken() {
  const response = await fetch("/api/chat/voice-token", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });
  const data = (await response.json().catch(() => null)) as
    | GeminiVoiceTokenResponse
    | { message?: string }
    | null;
  if (!response.ok) {
    const message =
      data && "message" in data ? data.message : "Voice chat is unavailable.";
    throw new Error(message ?? "Voice chat is unavailable.");
  }
  if (!data || !("liveSupported" in data)) {
    throw new Error("Voice chat token response was invalid.");
  }
  if (!data.liveSupported) {
    throw new Error(data.message);
  }
  return data;
}

export async function startWebGeminiVoiceTurn({
  onAssistantTranscript,
  onError,
  onStatus,
  onUserTranscript,
}: WebGeminiVoiceCallbacks = {}): Promise<WebGeminiVoiceTurnController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this browser.");
  }

  onStatus?.("connecting");
  const tokenResponse = await requestVoiceToken();
  const audioContext = new AudioContext();
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const source = audioContext.createMediaStreamSource(mediaStream);
  const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  let userText = "";
  let assistantText = "";
  let hasStoppedInput = false;
  let isSettled = false;
  let setupTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopTimeout: ReturnType<typeof setTimeout> | null = null;
  let playbackCursor = 0;
  let resolveResult: ((result: WebGeminiVoiceTurnResult) => void) | null = null;
  let rejectResult: ((error: Error) => void) | null = null;

  const resultPromise = new Promise<WebGeminiVoiceTurnResult>(
    (resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    }
  );
  resultPromise.catch(() => undefined);

  const ws = new WebSocket(
    `${tokenResponse.webSocketUrl}?access_token=${encodeURIComponent(
      tokenResponse.token
    )}`
  );

  const cleanup = async () => {
    if (setupTimeout) {
      clearTimeout(setupTimeout);
      setupTimeout = null;
    }
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    try {
      ws.close();
    } catch {
      // The socket may already be closed.
    }
    if (audioContext.state !== "closed") {
      await audioContext.close().catch(() => undefined);
    }
  };

  const settle = (result: WebGeminiVoiceTurnResult) => {
    if (isSettled) {
      return;
    }
    isSettled = true;
    cleanup().catch(() => undefined);
    resolveResult?.(result);
  };

  const fail = (error: Error) => {
    if (isSettled) {
      return;
    }
    isSettled = true;
    cleanup().catch(() => undefined);
    onError?.(error);
    rejectResult?.(error);
  };

  processor.onaudioprocess = (event) => {
    if (hasStoppedInput || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: floatToPcm16Base64(
              input,
              audioContext.sampleRate,
              tokenResponse.inputSampleRate
            ),
            mimeType: tokenResponse.inputAudioMimeType,
          },
        },
      })
    );
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  setupTimeout = setTimeout(() => {
    fail(
      new Error(
        "Voice chat could not finish connecting to Gemini Live. Please try again."
      )
    );
  }, LIVE_SETUP_TIMEOUT_MS);

  ws.onopen = () => {
    ws.send(JSON.stringify(buildSetupMessage(tokenResponse.modelProviderModelId)));
  };

  ws.onerror = () => {
    fail(new Error("Voice chat connection failed."));
  };

  ws.onclose = (event) => {
    if (!isSettled && !hasStoppedInput) {
      fail(
        new Error(
          `Voice chat connection closed before recording finished. Code: ${event.code}`
        )
      );
    }
  };

  ws.onmessage = (event) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }

    if (message.setupComplete) {
      if (setupTimeout) {
        clearTimeout(setupTimeout);
        setupTimeout = null;
      }
      onStatus?.("listening");
      return;
    }

    const serverContent = message.serverContent;
    if (!serverContent || typeof serverContent !== "object") {
      return;
    }

    userText = appendTranscript(
      userText,
      serverContent.inputTranscription?.text
    );
    if (userText) {
      onUserTranscript?.(userText);
    }

    assistantText = appendTranscript(
      assistantText,
      serverContent.outputTranscription?.text
    );
    if (assistantText) {
      onAssistantTranscript?.(assistantText);
    }

    const parts = serverContent.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const audioData = part?.inlineData?.data;
        if (typeof audioData === "string" && audioData.length > 0) {
          onStatus?.("speaking");
          const buffer = base64Pcm16ToAudioBuffer({
            audioContext,
            base64Audio: audioData,
            sampleRate: tokenResponse.outputSampleRate,
          });
          const node = audioContext.createBufferSource();
          node.buffer = buffer;
          node.connect(audioContext.destination);
          const startAt = Math.max(audioContext.currentTime, playbackCursor);
          node.start(startAt);
          playbackCursor = startAt + buffer.duration;
        }
      }
    }

    if (serverContent.turnComplete && hasStoppedInput) {
      settle({
        assistantText: assistantText.trim(),
        userText: userText.trim(),
      });
    }
  };

  return {
    cancel: () => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      cleanup().catch(() => undefined);
      resolveResult?.({ assistantText: "", userText: "" });
    },
    stop: async () => {
      if (!hasStoppedInput) {
        hasStoppedInput = true;
        onStatus?.("thinking");
        processor.disconnect();
        for (const track of mediaStream.getAudioTracks()) {
          track.stop();
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audioStreamEnd: true,
              },
            })
          );
        }
        stopTimeout = setTimeout(() => {
          settle({
            assistantText: assistantText.trim(),
            userText: userText.trim(),
          });
        }, TURN_RESULT_TIMEOUT_MS);
      }
      return resultPromise;
    },
  };
}
