"use client";

import type { GeminiVoiceTokenResponse } from "@/lib/voice/live";
import {
  VOICE_ACTIVITY_PREFIX_PADDING_MS,
  VOICE_ACTIVITY_SILENCE_DURATION_MS,
} from "@/lib/voice/live";

export type WebGeminiVoiceTurnStatus =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export type WebGeminiVoiceConversationMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  usage?: WebGeminiVoiceTurnUsage;
};

export type WebGeminiVoiceTurnResult = {
  messages: WebGeminiVoiceConversationMessage[];
};

export type WebGeminiVoiceTurnUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type WebGeminiVoiceTurnController = {
  cancel: () => void;
  getMessages: () => WebGeminiVoiceConversationMessage[];
  stop: () => Promise<WebGeminiVoiceTurnResult>;
};

type WebGeminiVoiceCallbacks = {
  onAssistantTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
  onInputLevel?: (level: number) => void;
  onMessages?: (messages: WebGeminiVoiceConversationMessage[]) => void;
  onStatus?: (status: WebGeminiVoiceTurnStatus) => void;
  onUserTranscript?: (text: string) => void;
};

const LIVE_SETUP_TIMEOUT_MS = 15_000;
const TURN_RESULT_TIMEOUT_MS = 30_000;
const PROCESSOR_BUFFER_SIZE = 4096;
const ASSISTANT_PLAYBACK_MUTE_PADDING_MS = 250;
const INPUT_LEVEL_NOISE_FLOOR = 0.015;
const INPUT_LEVEL_SPEECH_RANGE = 0.18;

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

function createMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function toPositiveTokenCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function readUsageMetadata(value: unknown): WebGeminiVoiceTurnUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const metadata = value as Record<string, unknown>;
  const inputTokens = toPositiveTokenCount(
    metadata.promptTokenCount ?? metadata.prompt_token_count
  );
  const outputTokens = toPositiveTokenCount(
    metadata.responseTokenCount ?? metadata.response_token_count
  );
  const totalTokens = toPositiveTokenCount(
    metadata.totalTokenCount ?? metadata.total_token_count
  );

  if (inputTokens > 0 || outputTokens > 0) {
    return { inputTokens, outputTokens };
  }
  if (totalTokens > 0) {
    return {
      inputTokens: Math.ceil(totalTokens / 2),
      outputTokens: Math.max(1, Math.floor(totalTokens / 2)),
    };
  }
  return null;
}

async function parseServerMessage(data: unknown) {
  let rawMessage: string;
  if (typeof data === "string") {
    rawMessage = data;
  } else if (data instanceof Blob) {
    rawMessage = await data.text();
  } else if (data instanceof ArrayBuffer) {
    rawMessage = new TextDecoder().decode(data);
  } else {
    return null;
  }

  try {
    return JSON.parse(rawMessage) as Record<string, any>;
  } catch {
    return null;
  }
}

function buildSetupMessage(tokenResponse: Extract<GeminiVoiceTokenResponse, { liveSupported: true }>) {
  return {
    setup: {
      model: `models/${tokenResponse.modelProviderModelId}`,
      generationConfig: {
        mediaResolution: tokenResponse.mediaResolution,
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: tokenResponse.voiceName,
            },
          },
        },
        temperature: 0.7,
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
        automaticActivityDetection: {
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: VOICE_ACTIVITY_PREFIX_PADDING_MS,
          silenceDurationMs: VOICE_ACTIVITY_SILENCE_DURATION_MS,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        },
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      systemInstruction: {
        role: "user",
        parts: [
          {
            text: tokenResponse.systemInstruction,
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

function getInputLevel(input: Float32Array) {
  if (input.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / input.length);
  const normalized =
    (rms - INPUT_LEVEL_NOISE_FLOOR) / INPUT_LEVEL_SPEECH_RANGE;
  return Math.max(0, Math.min(1, normalized));
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

function getVoiceCloseErrorMessage(event: CloseEvent) {
  const reason = event.reason.trim();
  if (/prepayment credits|billing|quota|credits/i.test(reason)) {
    return "Voice chat is unavailable because Google Live API billing or prepaid credits are depleted. Add credits or update billing in Google AI Studio, then try again.";
  }
  if (reason) {
    return `Voice chat connection closed before recording finished. Code: ${event.code}. ${reason.slice(0, 180)}`;
  }
  return `Voice chat connection closed before recording finished. Code: ${event.code}`;
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
  onInputLevel,
  onMessages,
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
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(() => undefined);
  }
  const source = audioContext.createMediaStreamSource(mediaStream);
  const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  let userText = "";
  let assistantText = "";
  let messages: WebGeminiVoiceConversationMessage[] = [];
  let activeUserMessageId: string | null = null;
  let activeAssistantMessageId: string | null = null;
  let currentTurnUsage: WebGeminiVoiceTurnUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };
  let lastUsageSnapshot: WebGeminiVoiceTurnUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };
  let hasStoppedInput = false;
  let hasInputStarted = false;
  let isSetupComplete = false;
  let isSettled = false;
  let assistantPlaybackMutedUntil = 0;
  let setupTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopTimeout: ReturnType<typeof setTimeout> | null = null;
  let listeningReadyTimeout: ReturnType<typeof setTimeout> | null = null;
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

  const emitMessages = () => {
    onMessages?.(messages.map((message) => ({ ...message })));
  };

  const updateActiveMessage = (
    role: WebGeminiVoiceConversationMessage["role"],
    text: string
  ) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    const activeId =
      role === "user" ? activeUserMessageId : activeAssistantMessageId;
    if (activeId) {
      messages = messages.map((message) =>
        message.id === activeId ? { ...message, text: normalizedText } : message
      );
      emitMessages();
      return;
    }

    const id = createMessageId();
    if (role === "user") {
      activeUserMessageId = id;
    } else {
      activeAssistantMessageId = id;
    }
    messages = [...messages, { id, role, text: normalizedText }];
    emitMessages();
  };

  const applyUsageToActiveAssistantMessage = () => {
    if (
      !activeAssistantMessageId ||
      (currentTurnUsage.inputTokens <= 0 && currentTurnUsage.outputTokens <= 0)
    ) {
      return;
    }
    messages = messages.map((message) =>
      message.id === activeAssistantMessageId
        ? {
            ...message,
            usage: {
              inputTokens: currentTurnUsage.inputTokens,
              outputTokens: currentTurnUsage.outputTokens,
            },
          }
        : message
    );
    emitMessages();
  };

  const cleanup = async () => {
    if (setupTimeout) {
      clearTimeout(setupTimeout);
      setupTimeout = null;
    }
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }
    if (listeningReadyTimeout) {
      clearTimeout(listeningReadyTimeout);
      listeningReadyTimeout = null;
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

  const resetInputReadiness = () => {
    hasInputStarted = false;
    onInputLevel?.(0);
    if (listeningReadyTimeout) {
      clearTimeout(listeningReadyTimeout);
      listeningReadyTimeout = null;
    }
  };

  const markInputReady = () => {
    if (hasInputStarted || hasStoppedInput || isSettled) {
      return;
    }
    hasInputStarted = true;
    onStatus?.("listening");
  };

  processor.onaudioprocess = (event) => {
    if (
      hasStoppedInput ||
      !isSetupComplete ||
      ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    if (Date.now() < assistantPlaybackMutedUntil) {
      onInputLevel?.(0);
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    onInputLevel?.(getInputLevel(input));
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
    markInputReady();
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
    ws.send(JSON.stringify(buildSetupMessage(tokenResponse)));
  };

  ws.onerror = () => {
    fail(new Error("Voice chat connection failed."));
  };

  ws.onclose = (event) => {
    if (!isSettled && !hasStoppedInput) {
      fail(new Error(getVoiceCloseErrorMessage(event)));
    }
  };

  ws.onmessage = async (event) => {
    const message = await parseServerMessage(event.data);
    if (!message) {
      return;
    }

    if (message.setupComplete) {
      isSetupComplete = true;
      if (setupTimeout) {
        clearTimeout(setupTimeout);
        setupTimeout = null;
      }
      return;
    }

    const usageSnapshot = readUsageMetadata(message.usageMetadata);
    if (usageSnapshot) {
      const inputDelta =
        usageSnapshot.inputTokens >= lastUsageSnapshot.inputTokens
          ? usageSnapshot.inputTokens - lastUsageSnapshot.inputTokens
          : usageSnapshot.inputTokens;
      const outputDelta =
        usageSnapshot.outputTokens >= lastUsageSnapshot.outputTokens
          ? usageSnapshot.outputTokens - lastUsageSnapshot.outputTokens
          : usageSnapshot.outputTokens;
      lastUsageSnapshot = usageSnapshot;
      currentTurnUsage = {
        inputTokens: currentTurnUsage.inputTokens + inputDelta,
        outputTokens: currentTurnUsage.outputTokens + outputDelta,
      };
      applyUsageToActiveAssistantMessage();
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
      updateActiveMessage("user", userText);
      onUserTranscript?.(userText);
    }

    assistantText = appendTranscript(
      assistantText,
      serverContent.outputTranscription?.text
    );
    if (assistantText) {
      updateActiveMessage("assistant", assistantText);
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
          assistantPlaybackMutedUntil = Math.max(
            assistantPlaybackMutedUntil,
            Date.now() +
              buffer.duration * 1000 +
              ASSISTANT_PLAYBACK_MUTE_PADDING_MS
          );
          resetInputReadiness();
        }
      }
    }

    if (serverContent.turnComplete) {
      applyUsageToActiveAssistantMessage();
      userText = "";
      assistantText = "";
      activeUserMessageId = null;
      activeAssistantMessageId = null;
      currentTurnUsage = {
        inputTokens: 0,
        outputTokens: 0,
      };
      if (hasStoppedInput) {
        settle({ messages });
      } else {
        const listeningDelayMs = Math.max(
          0,
          assistantPlaybackMutedUntil - Date.now()
        );
        if (listeningDelayMs === 0) {
          markInputReady();
        } else {
          listeningReadyTimeout = setTimeout(() => {
            listeningReadyTimeout = null;
            markInputReady();
          }, listeningDelayMs);
        }
      }
    }
  };

  return {
    cancel: () => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      cleanup().catch(() => undefined);
      resolveResult?.({ messages: [] });
    },
    getMessages: () => messages.map((message) => ({ ...message })),
    stop: async () => {
      if (!hasStoppedInput) {
        hasStoppedInput = true;
        onStatus?.("thinking");
        onInputLevel?.(0);
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
          settle({ messages });
        }, TURN_RESULT_TIMEOUT_MS);
      }
      return resultPromise;
    },
  };
}
