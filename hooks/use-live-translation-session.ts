"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  LIVE_AUDIO_MIME_TYPE,
  type LiveTranslationTokenResponse,
} from "@/lib/translate/live";

const BROWSER_TRANSLATION_DEBOUNCE_MS = 650;
const LIVE_AUDIO_FLUSH_INTERVAL_MS = 120;
const LIVE_AUDIO_FLUSH_MIN_BYTES = 4096;
const LIVE_CAPTURE_WORKLET_NAME = "translate-capture-processor";
const LIVE_CAPTURE_WORKLET_PATH = "/worklets/translate-capture-processor.js";

export type LiveTranslationPhase =
  | "idle"
  | "starting"
  | "listening"
  | "active"
  | "translating"
  | "stopped"
  | "error";

export type LiveCaptionLine = {
  id: number;
  text: string;
};

type UseLiveTranslationSessionOptions = {
  targetLanguageCode: string;
};

type SourcePreviewState = {
  interpretedText: string;
  rawText: string;
};

type CaptionKind = "transcript" | "translation";

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type LiveSessionLike = {
  close: () => void;
  sendRealtimeInput: (params: { audio?: Blob; audioStreamEnd?: boolean }) => void;
};

type LiveServerMessageLike = {
  inputTranscription?: {
    finished?: boolean;
    text?: string;
  };
  outputTranscription?: {
    finished?: boolean;
    text?: string;
  };
  serverContent?: {
    generationComplete?: boolean;
    interrupted?: boolean;
    turnComplete?: boolean;
    waitingForInput?: boolean;
  };
};

type LiveTokenSuccessResponse = Extract<
  LiveTranslationTokenResponse,
  { liveSupported: true }
>;

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function appendSegment(currentValue: string, nextSegment: string) {
  const current = currentValue.trim();
  const next = nextSegment.trim();

  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  if (current.endsWith("\n") || next.startsWith("\n")) {
    return `${current}${next}`;
  }

  if (/^[,.;:!?)}\]"']/.test(next)) {
    return `${current}${next}`;
  }

  return `${current} ${next}`;
}

function composePreview(committedValue: string, previewValue: string) {
  return [committedValue.trim(), previewValue.trim()].filter(Boolean).join(" ").trim();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message.trim();
  }

  return fallback;
}

function concatArrayBuffers(buffers: ArrayBuffer[]) {
  const totalBytes = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return merged.buffer;
}

async function requestTranslation({
  mode,
  signal,
  sourceText,
  targetLanguageCode,
}: {
  mode: "speech" | "text";
  signal?: AbortSignal;
  sourceText: string;
  targetLanguageCode: string;
}) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    signal,
    body: JSON.stringify({
      mode,
      sourceText,
      targetLanguageCode,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; translatedText?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message?.trim() || "Translation failed.");
  }

  return payload?.translatedText?.trim() ?? "";
}

async function requestLiveToken(
  targetLanguageCode: string
): Promise<LiveTranslationTokenResponse> {
  const response = await fetch("/api/translate/live-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      targetLanguageCode,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | LiveTranslationTokenResponse
    | { message?: string }
    | null;

  const responseMessage =
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message.trim()
      : "";

  if (!response.ok) {
    throw new Error(responseMessage || "Unable to start live translation.");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("liveSupported" in payload)
  ) {
    throw new Error("Live translation returned an invalid response.");
  }

  return payload;
}

export function useLiveTranslationSession({
  targetLanguageCode,
}: UseLiveTranslationSessionOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFlushIntervalRef = useRef<number | null>(null);
  const browserAbortControllerRef = useRef<AbortController | null>(null);
  const browserCommittedRef = useRef("");
  const browserInterimRef = useRef("");
  const liveModulePromiseRef =
    useRef<Promise<typeof import("@google/genai")> | null>(null);
  const livePendingAudioBuffersRef = useRef<ArrayBuffer[]>([]);
  const livePendingAudioBytesRef = useRef(0);
  const liveSessionRef = useRef<LiveSessionLike | null>(null);
  const liveSourceCommittedRef = useRef("");
  const liveSourcePreviewRef = useRef("");
  const liveTokenRef = useRef<LiveTokenSuccessResponse | null>(null);
  const liveTranslatedCommittedRef = useRef("");
  const liveTranslatedPreviewRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const previousTargetLanguageCodeRef = useRef(targetLanguageCode);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const runIdRef = useRef(0);
  const sessionIdRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const transcriptLineIdRef = useRef(0);
  const translationLineIdRef = useRef(0);
  const unmountedRef = useRef(false);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<
    PermissionState | "unsupported" | "unknown"
  >("unknown");
  const [phase, setPhase] = useState<LiveTranslationPhase>("idle");
  const [sessionId, setSessionId] = useState(0);
  const [sourcePreview, setSourcePreview] = useState<SourcePreviewState>({
    interpretedText: "",
    rawText: "",
  });
  const [speechEngine, setSpeechEngine] = useState<"browser" | "live" | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<LiveCaptionLine[]>([]);
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [translationLines, setTranslationLines] = useState<LiveCaptionLine[]>([]);
  const [translationPreview, setTranslationPreview] = useState("");
  const [translatedText, setTranslatedText] = useState("");

  const hasBrowserSpeechRecognitionSupport =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasLiveCaptureSupport =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const isSupported =
    hasLiveCaptureSupport || hasBrowserSpeechRecognitionSupport;
  const isRunning =
    phase === "starting" ||
    phase === "listening" ||
    phase === "active" ||
    phase === "translating";

  const syncRawText = useEffectEvent((nextRawText: string) => {
    setSourcePreview((current) =>
      current.rawText === nextRawText ? current : { ...current, rawText: nextRawText }
    );
  });

  const syncInterpretedText = useEffectEvent((nextInterpretedText: string) => {
    setSourcePreview((current) =>
      current.interpretedText === nextInterpretedText
        ? current
        : { ...current, interpretedText: nextInterpretedText }
    );
  });

  const syncBrowserRawText = useEffectEvent(() => {
    syncRawText(composePreview(browserCommittedRef.current, browserInterimRef.current));
  });

  const syncLiveRawText = useEffectEvent(() => {
    syncRawText(composePreview(liveSourceCommittedRef.current, liveSourcePreviewRef.current));
  });

  const syncLiveTranslatedText = useEffectEvent(() => {
    const nextTranslatedText = composePreview(
      liveTranslatedCommittedRef.current,
      liveTranslatedPreviewRef.current
    );
    setTranslatedText(nextTranslatedText);
    syncInterpretedText(nextTranslatedText);
  });

  const appendCaptionLine = useEffectEvent((kind: CaptionKind, value: string) => {
    const text = value.trim();
    if (!text) {
      return;
    }

    if (kind === "transcript") {
      const nextId = transcriptLineIdRef.current + 1;
      transcriptLineIdRef.current = nextId;
      setTranscriptLines((current) => [...current, { id: nextId, text }].slice(-6));
      return;
    }

    const nextId = translationLineIdRef.current + 1;
    translationLineIdRef.current = nextId;
    setTranslationLines((current) => [...current, { id: nextId, text }].slice(-6));
  });

  const setCaptionPreview = useEffectEvent((kind: CaptionKind, value: string) => {
    const text = value.trim();
    if (kind === "transcript") {
      setTranscriptPreview(text);
      return;
    }

    setTranslationPreview(text);
  });

  const clearLiveAudioBuffer = useEffectEvent(() => {
    livePendingAudioBuffersRef.current = [];
    livePendingAudioBytesRef.current = 0;
  });

  const flushLiveAudio = useEffectEvent(() => {
    if (
      !liveSessionRef.current ||
      livePendingAudioBuffersRef.current.length === 0 ||
      livePendingAudioBytesRef.current === 0
    ) {
      return;
    }

    const mergedBuffer = concatArrayBuffers(livePendingAudioBuffersRef.current);
    clearLiveAudioBuffer();

    try {
      liveSessionRef.current.sendRealtimeInput({
        audio: new Blob([mergedBuffer], { type: LIVE_AUDIO_MIME_TYPE }),
      });
    } catch {
      // ignore send failures during teardown
    }
  });

  const teardownAudioPipeline = useEffectEvent(async () => {
    if (audioFlushIntervalRef.current !== null) {
      window.clearInterval(audioFlushIntervalRef.current);
      audioFlushIntervalRef.current = null;
    }

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    clearLiveAudioBuffer();

    if (audioContext) {
      await audioContext.close().catch(() => undefined);
    }
  });

  const stopAllStreamingResources = useEffectEvent(
    async ({ signalLiveAudioEnd = false }: { signalLiveAudioEnd?: boolean } = {}) => {
      browserAbortControllerRef.current?.abort();
      browserAbortControllerRef.current = null;
      recognitionRef.current?.stop();

      if (signalLiveAudioEnd) {
        try {
          flushLiveAudio();
          liveSessionRef.current?.sendRealtimeInput({
            audioStreamEnd: true,
          });
        } catch {
          // ignore close-path send failures
        }
      }

      liveSessionRef.current?.close();
      liveSessionRef.current = null;
      liveTokenRef.current = null;
      await teardownAudioPipeline();
    }
  );

  const resetSpeechBuffers = useEffectEvent(
    ({
      preserveRawText = false,
      preserveTranslatedText = false,
    }: {
      preserveRawText?: boolean;
      preserveTranslatedText?: boolean;
    } = {}) => {
      const preservedRawText = preserveRawText ? sourcePreview.rawText.trim() : "";
      browserCommittedRef.current = preservedRawText;
      browserInterimRef.current = "";
      liveSourceCommittedRef.current = preservedRawText;
      liveSourcePreviewRef.current = "";
      liveTranslatedCommittedRef.current = preserveTranslatedText
        ? translatedText.trim()
        : "";
      liveTranslatedPreviewRef.current = "";
      transcriptLineIdRef.current = 0;
      translationLineIdRef.current = 0;
      setTranscriptLines(
        preservedRawText ? [{ id: 1, text: preservedRawText }] : []
      );
      transcriptLineIdRef.current = preservedRawText ? 1 : 0;
      setTranscriptPreview("");
      setTranslationLines(
        preserveTranslatedText && translatedText.trim()
          ? [{ id: 1, text: translatedText.trim() }]
          : []
      );
      translationLineIdRef.current =
        preserveTranslatedText && translatedText.trim() ? 1 : 0;
      setTranslationPreview("");
      syncRawText(preservedRawText);
      if (!preserveTranslatedText) {
        setTranslatedText("");
        syncInterpretedText("");
      }
    }
  );

  const loadLiveModule = useEffectEvent(async () => {
    if (!liveModulePromiseRef.current) {
      liveModulePromiseRef.current = import("@google/genai");
    }

    return await liveModulePromiseRef.current;
  });

  const ensureAudioPipeline = useEffectEvent(async (runId: number) => {
    if (audioContextRef.current && mediaStreamRef.current && workletNodeRef.current) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    if (runId !== runIdRef.current || stopRequestedRef.current) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    const audioContext = new AudioContext({
      latencyHint: "interactive",
    });
    await audioContext.resume().catch(() => undefined);

    if (!audioContext.audioWorklet || typeof AudioWorkletNode === "undefined") {
      await audioContext.close().catch(() => undefined);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw new Error("Audio worklets are not available in this browser.");
    }

    await audioContext.audioWorklet.addModule(LIVE_CAPTURE_WORKLET_PATH);

    if (runId !== runIdRef.current || stopRequestedRef.current) {
      await audioContext.close().catch(() => undefined);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(
      audioContext,
      LIVE_CAPTURE_WORKLET_NAME
    );
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (
        runId !== runIdRef.current ||
        stopRequestedRef.current ||
        !(event.data instanceof ArrayBuffer)
      ) {
        return;
      }

      livePendingAudioBuffersRef.current.push(event.data);
      livePendingAudioBytesRef.current += event.data.byteLength;

      if (livePendingAudioBytesRef.current >= LIVE_AUDIO_FLUSH_MIN_BYTES) {
        flushLiveAudio();
      }
    };

    sourceNode.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioContext.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    workletNodeRef.current = workletNode;
    setPermissionState("granted");

    if (audioFlushIntervalRef.current === null) {
      audioFlushIntervalRef.current = window.setInterval(() => {
        flushLiveAudio();
      }, LIVE_AUDIO_FLUSH_INTERVAL_MS);
    }
  });

  const startBrowserSession = useEffectEvent(
    ({
      notice,
      preserveTranslatedText = true,
      runId,
    }: {
      notice: string;
      preserveTranslatedText?: boolean;
      runId: number;
    }) => {
      const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionCtor) {
        return false;
      }

      if (!recognitionRef.current) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          if (runId !== runIdRef.current || stopRequestedRef.current) {
            return;
          }

          let nextCommitted = browserCommittedRef.current;
          let nextInterim = "";

          for (
            let index = event.resultIndex;
            index < event.results.length;
            index += 1
          ) {
            const result = event.results[index];
            const transcript = result[0]?.transcript?.trim() ?? "";

            if (!transcript) {
              continue;
            }

            if (result.isFinal) {
              nextCommitted = appendSegment(nextCommitted, transcript);
              appendCaptionLine("transcript", transcript);
            } else {
              nextInterim = appendSegment(nextInterim, transcript);
            }
          }

          browserCommittedRef.current = nextCommitted;
          browserInterimRef.current = nextInterim;
          setCaptionPreview("transcript", nextInterim);
          syncBrowserRawText();
          setError(null);
          setPhase(
            composePreview(browserCommittedRef.current, browserInterimRef.current)
              ? "active"
              : "listening"
          );
        };
        recognition.onerror = (event) => {
          if (stopRequestedRef.current) {
            return;
          }

          if (event.error === "not-allowed") {
            setPermissionState("denied");
          }

          setError(
            event.error === "not-allowed"
              ? "Microphone permission was denied."
              : "Speech recognition stopped unexpectedly."
          );
          setPhase("error");
        };
        recognition.onend = () => {
          if (
            stopRequestedRef.current ||
            unmountedRef.current ||
            runId !== runIdRef.current
          ) {
            return;
          }

          try {
            recognition.start();
          } catch {
            setPhase("stopped");
          }
        };
        recognitionRef.current = recognition;
      }

      setSpeechEngine("browser");
      setSpeechNotice(notice);
      setError(null);

      if (!preserveTranslatedText) {
        setTranslatedText("");
        syncInterpretedText("");
        setCaptionPreview("translation", "");
      }

      try {
        recognitionRef.current.lang =
          typeof navigator !== "undefined" && navigator.language
            ? navigator.language
            : "en-US";
        recognitionRef.current.start();
        setPhase(browserCommittedRef.current.trim() ? "active" : "listening");
        return true;
      } catch (error) {
        setError(getErrorMessage(error, "Unable to start speech recognition."));
        setPhase("error");
        return false;
      }
    }
  );

  const switchToBrowserFallback = useEffectEvent(
    async ({
      notice,
      preserveTranslatedText = true,
      runId,
    }: {
      notice: string;
      preserveTranslatedText?: boolean;
      runId: number;
    }) => {
      await teardownAudioPipeline();
      liveSessionRef.current?.close();
      liveSessionRef.current = null;
      liveTokenRef.current = null;
      const fallbackStarted = startBrowserSession({
        notice,
        preserveTranslatedText,
        runId,
      });

      if (!fallbackStarted) {
        setSpeechEngine(null);
        setSpeechNotice(notice);
        setError("Speech recognition is not supported in this browser.");
        setPhase("error");
      }

      return fallbackStarted;
    }
  );

  const connectLiveSession = useEffectEvent(
    async ({
      runId,
      tokenResponse,
    }: {
      runId: number;
      tokenResponse: LiveTokenSuccessResponse;
    }) => {
      const { GoogleGenAI } = await loadLiveModule();

      if (runId !== runIdRef.current || stopRequestedRef.current) {
        return false;
      }

      const ai = new GoogleGenAI({
        apiKey: tokenResponse.token,
        apiVersion: "v1alpha",
      });

      const session = (await ai.live.connect({
        model: tokenResponse.modelProviderModelId,
        callbacks: {
          onopen: () => {
            if (runId !== runIdRef.current || stopRequestedRef.current) {
              return;
            }

            setSpeechEngine("live");
            setSpeechNotice(null);
            setError(null);
            setPhase(
              composePreview(
                liveSourceCommittedRef.current,
                liveSourcePreviewRef.current
              )
                ? "active"
                : "listening"
            );
          },
          onmessage: (message: LiveServerMessageLike) => {
            if (runId !== runIdRef.current || stopRequestedRef.current) {
              return;
            }

            if (message.inputTranscription?.text?.trim()) {
              if (message.inputTranscription.finished) {
                liveSourceCommittedRef.current = appendSegment(
                  liveSourceCommittedRef.current,
                  message.inputTranscription.text
                );
                liveSourcePreviewRef.current = "";
                appendCaptionLine("transcript", message.inputTranscription.text);
                setCaptionPreview("transcript", "");
              } else {
                liveSourcePreviewRef.current = message.inputTranscription.text.trim();
                setCaptionPreview("transcript", liveSourcePreviewRef.current);
              }
              syncLiveRawText();
            }

            if (message.outputTranscription?.text?.trim()) {
              if (message.outputTranscription.finished) {
                liveTranslatedCommittedRef.current = appendSegment(
                  liveTranslatedCommittedRef.current,
                  message.outputTranscription.text
                );
                liveTranslatedPreviewRef.current = "";
                appendCaptionLine("translation", message.outputTranscription.text);
                setCaptionPreview("translation", "");
              } else {
                liveTranslatedPreviewRef.current =
                  message.outputTranscription.text.trim();
                setCaptionPreview("translation", liveTranslatedPreviewRef.current);
              }
              syncLiveTranslatedText();
            }

            if (message.serverContent?.interrupted) {
              liveTranslatedPreviewRef.current = "";
              setCaptionPreview("translation", "");
              syncLiveTranslatedText();
            }

            if (
              message.serverContent?.generationComplete ||
              message.serverContent?.turnComplete ||
              message.serverContent?.waitingForInput
            ) {
              setPhase(
                composePreview(
                  liveSourceCommittedRef.current,
                  liveSourcePreviewRef.current
                )
                  ? "active"
                  : "listening"
              );
            }
          },
          onerror: (event) => {
            if (stopRequestedRef.current) {
              return;
            }

            setError(
              getErrorMessage(
                event.error ?? event,
                "Live translation encountered a connection error."
              )
            );
          },
          onclose: () => {
            if (
              runId !== runIdRef.current ||
              stopRequestedRef.current ||
              unmountedRef.current
            ) {
              return;
            }

            void switchToBrowserFallback({
              notice: "Live translation disconnected. Using browser speech fallback.",
              preserveTranslatedText: true,
              runId,
            });
          },
        },
      })) as unknown as LiveSessionLike;

      if (runId !== runIdRef.current || stopRequestedRef.current) {
        session.close();
        return false;
      }

      liveSessionRef.current = session;
      liveTokenRef.current = tokenResponse;
      return true;
    }
  );

  const startLiveSession = useEffectEvent(
    async ({
      preserveRawText = false,
      preserveTranslatedText = false,
      runId,
    }: {
      preserveRawText?: boolean;
      preserveTranslatedText?: boolean;
      runId: number;
    }) => {
      resetSpeechBuffers({
        preserveRawText,
        preserveTranslatedText,
      });
      setSpeechEngine("live");
      setSpeechNotice(null);
      setError(null);
      setPhase("starting");

      const tokenResponse = await requestLiveToken(targetLanguageCode.trim().toLowerCase());

      if (runId !== runIdRef.current || stopRequestedRef.current) {
        return false;
      }

      if (!tokenResponse.liveSupported) {
        return await switchToBrowserFallback({
          notice: `${tokenResponse.message} Using browser speech fallback.`,
          preserveTranslatedText,
          runId,
        });
      }

      try {
        await ensureAudioPipeline(runId);
        return await connectLiveSession({
          runId,
          tokenResponse,
        });
      } catch (error) {
        return await switchToBrowserFallback({
          notice: `${getErrorMessage(
            error,
            "Unable to start live translation."
          )} Using browser speech fallback.`,
          preserveTranslatedText,
          runId,
        });
      }
    }
  );

  useEffect(() => {
    if (
      speechEngine !== "browser" ||
      !targetLanguageCode.trim() ||
      !sourcePreview.rawText.trim()
    ) {
      if (speechEngine === "browser" && !sourcePreview.rawText.trim()) {
        setTranslatedText("");
        syncInterpretedText("");
      }
      return;
    }

    const currentRunId = runIdRef.current;
    const controller = new AbortController();
    browserAbortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      setPhase("translating");
      setError(null);

      void requestTranslation({
        mode: "speech",
        signal: controller.signal,
        sourceText: sourcePreview.rawText.trim(),
        targetLanguageCode,
      })
        .then((nextTranslatedText) => {
          if (
            controller.signal.aborted ||
            currentRunId !== runIdRef.current ||
            speechEngine !== "browser"
          ) {
            return;
          }

          if (
            translationPreview.trim() &&
            translationPreview.trim() !== nextTranslatedText.trim()
          ) {
            appendCaptionLine("translation", translationPreview);
          }

          setTranslatedText(nextTranslatedText);
          syncInterpretedText(nextTranslatedText);
          setCaptionPreview("translation", nextTranslatedText);
          setPhase(nextTranslatedText ? "active" : "listening");
        })
        .catch((error) => {
          if (
            controller.signal.aborted ||
            currentRunId !== runIdRef.current ||
            speechEngine !== "browser"
          ) {
            return;
          }

          setCaptionPreview("translation", "");
          setError(getErrorMessage(error, "Translation could not be completed."));
          setPhase("error");
        });
    }, BROWSER_TRANSLATION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (browserAbortControllerRef.current === controller) {
        browserAbortControllerRef.current = null;
      }
    };
  }, [
    appendCaptionLine,
    setCaptionPreview,
    sourcePreview.rawText,
    speechEngine,
    syncInterpretedText,
    targetLanguageCode,
    translationPreview,
  ]);

  useEffect(() => {
    if (previousTargetLanguageCodeRef.current === targetLanguageCode) {
      return;
    }

    previousTargetLanguageCodeRef.current = targetLanguageCode;

    if (!isRunning || speechEngine !== "live" || !targetLanguageCode.trim()) {
      return;
    }

    const currentRunId = runIdRef.current + 1;
    runIdRef.current = currentRunId;
    stopRequestedRef.current = false;

    void (async () => {
      await stopAllStreamingResources({
        signalLiveAudioEnd: true,
      });
      await startLiveSession({
        preserveRawText: true,
        preserveTranslatedText: false,
        runId: currentRunId,
      });
    })();
  }, [isRunning, speechEngine, startLiveSession, stopAllStreamingResources, targetLanguageCode]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.permissions ||
      typeof navigator.permissions.query !== "function"
    ) {
      setPermissionState(isSupported ? "unknown" : "unsupported");
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) {
          return;
        }

        permissionStatus = status;
        setPermissionState(status.state);
        status.onchange = () => {
          if (!cancelled) {
            setPermissionState(status.state);
          }
        };
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionState(isSupported ? "unknown" : "unsupported");
        }
      });

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [isSupported]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      stopRequestedRef.current = true;
      void stopAllStreamingResources();
    };
  }, [stopAllStreamingResources]);

  async function startSession() {
    if (!isSupported) {
      setError("Speech translation is not supported in this browser.");
      setPhase("error");
      return false;
    }

    if (!targetLanguageCode.trim()) {
      setError("Choose a target language before starting the mic.");
      setPhase("error");
      return false;
    }

    stopRequestedRef.current = false;
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;
    const nextSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);

    await stopAllStreamingResources();
    resetSpeechBuffers();
    setSpeechEngine(null);
    setSpeechNotice(null);
    setError(null);
    setTranslatedText("");
    syncInterpretedText("");
    syncRawText("");
    setPhase("starting");

    return await startLiveSession({
      runId: nextRunId,
    });
  }

  async function stopSession() {
    stopRequestedRef.current = true;
    runIdRef.current += 1;
    await stopAllStreamingResources({
      signalLiveAudioEnd: true,
    });
    setPhase("stopped");
  }

  async function resetSession() {
    stopRequestedRef.current = true;
    runIdRef.current += 1;
    await stopAllStreamingResources();
    resetSpeechBuffers();
    setSpeechEngine(null);
    setSpeechNotice(null);
    setError(null);
    setTranslatedText("");
    syncInterpretedText("");
    syncRawText("");
    setPhase("idle");
  }

  return {
    error,
    isRunning,
    isSupported,
    permissionState,
    phase,
    resetSession,
    sessionId,
    sourcePreview,
    speechEngine,
    speechNotice,
    transcriptLines,
    transcriptPreview,
    startSession,
    stopSession,
    translationLines,
    translationPreview,
    translatedText,
  };
}
