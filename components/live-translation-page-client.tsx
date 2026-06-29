"use client";

import {
  ExternalLink,
  Languages,
  LoaderCircle,
  Mic,
  RotateCcw,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  startWebGeminiVoiceTurn,
  type WebGeminiVoiceConversationMessage,
  type WebGeminiVoiceTurnController,
  type WebGeminiVoiceTurnStatus,
} from "@/lib/voice/web-live-voice";

type LiveTranslationLanguageOption = {
  code: string;
  name: string;
};

type LiveTranslationTurn = {
  id: string;
  inputTokens?: number;
  originalText: string;
  outputTokens?: number;
  timestamp: string;
  translatedText: string;
};

type LiveTranslationPageClientProps = {
  defaultLanguageACode: string;
  defaultLanguageBCode: string;
  languages: LiveTranslationLanguageOption[];
  settingsUnavailable: boolean;
};

type SaveSessionResponse = {
  chatId?: string;
  message?: string;
  turns?: LiveTranslationTurn[];
};

const VISUALIZER_BARS = [
  { delayMs: 0, heightClass: "h-8", id: "low" },
  { delayMs: 110, heightClass: "h-12", id: "mid-low" },
  { delayMs: 220, heightClass: "h-16", id: "peak" },
  { delayMs: 330, heightClass: "h-11", id: "mid" },
  { delayMs: 440, heightClass: "h-14", id: "high" },
  { delayMs: 550, heightClass: "h-9", id: "tail" },
] as const;

function buildConversationTurns(
  messages: WebGeminiVoiceConversationMessage[]
) {
  const turns: LiveTranslationTurn[] = [];
  let pendingOriginal: WebGeminiVoiceConversationMessage | null = null;

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) {
      continue;
    }
    if (message.role === "user") {
      pendingOriginal = message;
      continue;
    }
    if (!pendingOriginal) {
      continue;
    }
    turns.push({
      id: message.id,
      inputTokens: message.usage?.inputTokens,
      originalText: pendingOriginal.text.trim(),
      outputTokens: message.usage?.outputTokens,
      timestamp: new Date().toISOString(),
      translatedText: text,
    });
    pendingOriginal = null;
  }

  return turns;
}

function getStatusLabel({
  error,
  status,
  translate,
}: {
  error: string | null;
  status: WebGeminiVoiceTurnStatus;
  translate: (key: string, defaultText: string) => string;
}) {
  if (error) {
    return translate("live_translation.status.error", "Live Translation failed");
  }
  switch (status) {
    case "listening":
      return translate("live_translation.status.listening", "Listening...");
    case "thinking":
      return translate("live_translation.status.thinking", "Finalizing...");
    case "speaking":
      return translate("live_translation.status.speaking", "Speaking translation...");
    default:
      return translate("live_translation.status.connecting", "Connecting...");
  }
}

function LiveTranslationVisualizer({
  inputLevel,
  status,
}: {
  inputLevel: number;
  status: WebGeminiVoiceTurnStatus;
}) {
  const clampedLevel = Math.max(0, Math.min(1, inputLevel));
  const isUserSpeaking = status === "listening" && clampedLevel > 0.08;
  const isAssistantSpeaking = status === "speaking";
  const barLevels = [0.42, 0.68, 0.94, 0.56, 0.82, 0.48];

  return (
    <div
      aria-hidden="true"
      className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border bg-muted/25 px-5 py-8"
    >
      <style>
        {`
          @keyframes live-translation-wave {
            0%, 100% { transform: scaleY(0.24); }
            50% { transform: scaleY(var(--live-translation-wave-scale, 0.78)); }
          }
        `}
      </style>
      <div className="relative flex size-28 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 rounded-full border border-primary/20",
            isUserSpeaking || isAssistantSpeaking ? "animate-ping" : "opacity-30"
          )}
        />
        <span
          className={cn(
            "absolute inset-4 rounded-full border border-primary/15",
            isUserSpeaking || isAssistantSpeaking ? "animate-pulse" : "opacity-35"
          )}
        />
        <div className="relative flex size-16 items-center justify-center rounded-full bg-background shadow-sm">
          <Languages className="size-7 text-foreground" />
        </div>
      </div>

      <div className="mt-8 flex h-20 items-center justify-center gap-2">
        {VISUALIZER_BARS.map((bar, index) => (
          <span
            className={cn(
              "w-2 origin-center rounded-full transition-transform duration-100",
              bar.heightClass,
              isUserSpeaking || isAssistantSpeaking
                ? "bg-primary/80"
                : "bg-foreground/35"
            )}
            key={bar.id}
            style={
              isAssistantSpeaking
                ? ({
                    "--live-translation-wave-scale": String(
                      barLevels[index] ?? 0.6
                    ),
                    animation:
                      "live-translation-wave 0.95s ease-in-out infinite",
                    animationDelay: `${bar.delayMs}ms`,
                  } as CSSProperties)
                : {
                    transform: `scaleY(${Math.max(
                      0.18,
                      0.22 + clampedLevel * (barLevels[index] ?? 0.6)
                    )})`,
                  }
            }
          />
        ))}
      </div>
    </div>
  );
}

function LanguageSelect({
  ariaLabel,
  label,
  languages,
  onChange,
  value,
}: {
  ariaLabel: string;
  label: ReactNode;
  languages: LiveTranslationLanguageOption[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="font-medium text-sm">{label}</span>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger aria-label={ariaLabel} className="h-11 cursor-pointer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LiveTranslationPageClient({
  defaultLanguageACode,
  defaultLanguageBCode,
  languages,
  settingsUnavailable,
}: LiveTranslationPageClientProps) {
  const router = useRouter();
  const { translate } = useTranslation();
  const controllerRef = useRef<WebGeminiVoiceTurnController | null>(null);
  const [languageACode, setLanguageACode] = useState(defaultLanguageACode);
  const [languageBCode, setLanguageBCode] = useState(defaultLanguageBCode);
  const [status, setStatus] =
    useState<WebGeminiVoiceTurnStatus>("connecting");
  const [inputLevel, setInputLevel] = useState(0);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptTurns, setTranscriptTurns] = useState<LiveTranslationTurn[]>(
    []
  );
  const [savedChatId, setSavedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WebGeminiVoiceConversationMessage[]>(
    []
  );

  const languageAName = useMemo(
    () =>
      languages.find((language) => language.code === languageACode)?.name ??
      languageACode,
    [languageACode, languages]
  );
  const languageBName = useMemo(
    () =>
      languages.find((language) => language.code === languageBCode)?.name ??
      languageBCode,
    [languageBCode, languages]
  );
  const statusLabel = getStatusLabel({ error, status, translate });
  const hasLanguages = languages.length >= 2;
  const canStart =
    hasLanguages && !isSessionOpen && !isSaving && languageACode !== languageBCode;
  const canEnd =
    isSessionOpen && isSessionReady && !error && !isSaving && status !== "connecting";

  const resetRuntimeState = useCallback(() => {
    setStatus("connecting");
    setInputLevel(0);
    setIsSessionReady(false);
    setError(null);
    setMessages([]);
  }, []);

  const saveSession = useCallback(
    async (turns: LiveTranslationTurn[]) => {
      setIsSaving(true);
      try {
        const response = await fetch("/api/live-translation/session", {
          body: JSON.stringify({
            languageACode,
            languageBCode,
            selectedVisibilityType: "private",
            turns,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const payload = (await response.json().catch(() => null)) as
          | SaveSessionResponse
          | null;
        if (!response.ok) {
          throw new Error(
            payload?.message ??
              translate(
                "live_translation.error.save_failed",
                "Unable to save this Live Translation session."
              )
          );
        }
        setTranscriptTurns(payload?.turns?.length ? payload.turns : turns);
        setSavedChatId(payload?.chatId ?? null);
        toast({
          type: "success",
          description: translate(
            "live_translation.toast.saved",
            "Live Translation transcript saved."
          ),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [languageACode, languageBCode, translate]
  );

  const startSession = useCallback(async () => {
    if (!canStart) {
      return;
    }
    setSavedChatId(null);
    setTranscriptTurns([]);
    resetRuntimeState();
    setIsSessionOpen(true);
    try {
      const controller = await startWebGeminiVoiceTurn({
        onError: (nextError) => {
          setError(nextError.message);
        },
        onInputLevel: setInputLevel,
        onMessages: setMessages,
        onStatus: (nextStatus) => {
          setStatus(nextStatus);
          if (nextStatus === "listening") {
            setIsSessionReady(true);
          }
        },
        tokenBody: {
          languageACode,
          languageBCode,
        },
        tokenEndpoint: "/api/live-translation/token",
        unavailableMessage: translate(
          "live_translation.error.unavailable",
          "Live Translation is unavailable."
        ),
      });
      controllerRef.current = controller;
    } catch (nextError) {
      const message =
        nextError instanceof Error && nextError.message.trim()
          ? nextError.message
          : translate(
              "live_translation.error.failed",
              "Live Translation failed. Please try again."
            );
      setError(message);
      toast({ type: "error", description: message });
    }
  }, [canStart, languageACode, languageBCode, resetRuntimeState, translate]);

  const cancelSession = useCallback(() => {
    controllerRef.current?.cancel();
    controllerRef.current = null;
    setIsSessionOpen(false);
    resetRuntimeState();
  }, [resetRuntimeState]);

  const finishSession = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const result = await controller.stop();
      controllerRef.current = null;
      setIsSessionOpen(false);
      const turns = buildConversationTurns(result.messages);
      if (turns.length === 0) {
        throw new Error(
          translate(
            "live_translation.error.empty_result",
            "I could not hear enough speech. Please try again."
          )
        );
      }
      setTranscriptTurns(turns);
      await saveSession(turns);
      resetRuntimeState();
    } catch (nextError) {
      const message =
        nextError instanceof Error && nextError.message.trim()
          ? nextError.message
          : translate(
              "live_translation.error.failed",
              "Live Translation failed. Please try again."
            );
      setError(message);
      toast({ type: "error", description: message });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, resetRuntimeState, saveSession, translate]);

  const openSavedChat = useCallback(() => {
    if (savedChatId) {
      router.push(`/chat/${savedChatId}`);
    }
  }, [router, savedChatId]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4">
      {settingsUnavailable ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">
            <EditableTranslation
              defaultText="Live Translation settings could not be fully confirmed."
              translationKey="live_translation.warning.partial_title"
            />
          </p>
          <p className="mt-1">
            <EditableTranslation
              defaultText="The page is still available with safe defaults, but some language settings may be temporarily stale."
              translationKey="live_translation.warning.partial_body"
            />
          </p>
        </div>
      ) : null}

      <section className="rounded-lg border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <EditableTranslation
                className="font-semibold text-2xl"
                defaultText="Live Translation"
                description="Title for the Live Translation page."
                translationKey="live_translation.title"
              />
              <EditableTranslation
                className="max-w-2xl text-muted-foreground text-sm"
                defaultText="Use Gemini Live as a hands-free interpreter between two speakers."
                description="Short description for the Live Translation page."
                translationKey="live_translation.subtitle"
              />
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
              <Languages className="size-5" />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <LanguageSelect
              ariaLabel={translate(
                "live_translation.language_a",
                "Language A"
              )}
              label={
                <EditableTranslation
                  defaultText="Language A"
                  translationKey="live_translation.language_a"
                />
              }
              languages={languages}
              onChange={setLanguageACode}
              value={languageACode}
            />
            <LanguageSelect
              ariaLabel={translate(
                "live_translation.language_b",
                "Language B"
              )}
              label={
                <EditableTranslation
                  defaultText="Language B"
                  translationKey="live_translation.language_b"
                />
              }
              languages={languages.filter(
                (language) => language.code !== "auto"
              )}
              onChange={setLanguageBCode}
              value={languageBCode}
            />
          </div>

          {languageACode === languageBCode ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              <EditableTranslation
                defaultText="Choose two different languages before starting."
                translationKey="live_translation.validation.different_languages"
              />
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-sm">
              {languageAName} <span aria-hidden="true">↔</span> {languageBName}
            </p>
            <Button
              className="cursor-pointer gap-2"
              disabled={!canStart}
              onClick={() => {
                void startSession();
              }}
              type="button"
            >
              <Mic className="size-4" />
              <EditableTranslation
                defaultText="Start Live Translation"
                translationKey="live_translation.start"
              />
            </Button>
          </div>
        </div>
      </section>

      {transcriptTurns.length > 0 ? (
        <section className="rounded-lg border bg-background p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <EditableTranslation
                className="font-semibold text-lg"
                defaultText="Transcript"
                translationKey="live_translation.transcript.title"
              />
              <p className="text-muted-foreground text-sm">
                {languageAName} <span aria-hidden="true">↔</span> {languageBName}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="cursor-pointer gap-2"
                onClick={() => {
                  setTranscriptTurns([]);
                  setSavedChatId(null);
                }}
                type="button"
                variant="outline"
              >
                <RotateCcw className="size-4" />
                <EditableTranslation
                  defaultText="New session"
                  translationKey="live_translation.new_session"
                />
              </Button>
              {savedChatId ? (
                <Button
                  className="cursor-pointer gap-2"
                  onClick={openSavedChat}
                  type="button"
                >
                  <ExternalLink className="size-4" />
                  <EditableTranslation
                    defaultText="Open chat"
                    translationKey="live_translation.open_chat"
                  />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {transcriptTurns.map((turn, index) => (
              <article
                className="rounded-lg border bg-muted/20 p-4"
                key={`${turn.id}-${index}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3 text-muted-foreground text-xs">
                  <span>
                    {translate("live_translation.turn", "Turn")} {index + 1}
                  </span>
                  <time dateTime={turn.timestamp}>
                    {new Date(turn.timestamp).toLocaleTimeString()}
                  </time>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="font-medium text-sm">
                      {translate("live_translation.original", "Original")}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {turn.originalText}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-sm">
                      {translate("live_translation.translated", "Translated")}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {turn.translatedText}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isSessionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Languages className="size-7" />
              </div>
              <div>
                <EditableTranslation
                  className="font-semibold text-lg"
                  defaultText="Live Translation"
                  translationKey="live_translation.dialog.title"
                />
                <p className="text-muted-foreground text-sm">{statusLabel}</p>
              </div>
            </div>

            {!isSessionReady && !error ? (
              <div
                aria-live="polite"
                className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-5 py-8 text-center"
              >
                <div className="relative flex size-16 items-center justify-center rounded-full bg-background shadow-sm">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <Languages className="relative size-7 text-foreground" />
                </div>
                <EditableTranslation
                  className="mt-5 font-semibold text-base"
                  defaultText="Preparing interpreter..."
                  translationKey="live_translation.preparing_title"
                />
                <EditableTranslation
                  className="mt-2 text-muted-foreground text-sm"
                  defaultText="Connecting to Gemini Live..."
                  translationKey="live_translation.preparing_description"
                />
                <LoaderCircle className="mt-5 size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error && !isSessionReady ? (
              <div
                aria-live="assertive"
                className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-8 text-center"
              >
                <EditableTranslation
                  className="font-semibold text-base text-destructive"
                  defaultText="Live Translation setup failed"
                  translationKey="live_translation.setup_failed"
                />
                <p className="mt-2 max-w-xs text-muted-foreground text-sm">
                  {error}
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <LiveTranslationVisualizer
                  inputLevel={inputLevel}
                  status={status}
                />
              </div>
            )}

            {error && isSessionReady ? (
              <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                className="cursor-pointer"
                disabled={isSaving}
                onClick={cancelSession}
                type="button"
                variant="outline"
              >
                <EditableTranslation
                  defaultText="Cancel"
                  translationKey="live_translation.cancel"
                />
              </Button>
              <Button
                className="cursor-pointer gap-2"
                disabled={!canEnd}
                onClick={() => {
                  void finishSession();
                }}
                type="button"
              >
                {isSaving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                {isSaving ? (
                  <EditableTranslation
                    defaultText="Saving..."
                    translationKey="live_translation.saving"
                  />
                ) : (
                  <EditableTranslation
                    defaultText="End session"
                    translationKey="live_translation.end"
                  />
                )}
              </Button>
            </div>

            {messages.length > 0 ? (
              <p className="sr-only" aria-live="polite">
                {messages.length}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
