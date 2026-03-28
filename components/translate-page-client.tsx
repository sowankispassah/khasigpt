"use client";

import {
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Moon,
  RotateCcw,
  Sun,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type LiveCaptionLine,
  useLiveTranslationSession,
} from "@/hooks/use-live-translation-session";
import { TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME } from "@/lib/constants";
import type { TranslateProviderMode } from "@/lib/translate/config";
import { cn } from "@/lib/utils";

type TranslateLanguageOption = {
  code: string;
  isDefault: boolean;
  modelDisplayName: string | null;
  modelProvider: string | null;
  modelProviderModelId: string | null;
  name: string;
};

type TranslatePageClientProps = {
  initialTargetLanguageCode: string;
  languages: TranslateLanguageOption[];
  providerMode: TranslateProviderMode;
};

type PopupTheme = "dark" | "light";
type FullscreenPopup = "transcript" | "translation" | null;
type SourceInputMode = "speech" | "typing";
type TranslationUiState =
  | "idle"
  | "starting"
  | "listening"
  | "translating"
  | "active"
  | "stopped"
  | "error";

type CaptionDisplayItem = {
  id: string;
  isActive: boolean;
  text: string;
};

function getStatusMeta(
  state: TranslationUiState,
  speechEngine: "browser" | "live" | null
) {
  switch (state) {
    case "listening":
      return {
        badgeClassName:
          speechEngine === "browser"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        description:
          speechEngine === "browser"
            ? "Listening with browser speech fallback."
            : "Listening for live speech.",
        label: speechEngine === "browser" ? "Fallback" : "Listening",
      };
    case "translating":
      return {
        badgeClassName: "border-primary/30 bg-primary/10 text-primary",
        description:
          speechEngine === "browser"
            ? "Updating the fallback translation."
            : "Updating the live translation.",
        label: "Translating",
      };
    case "active":
      return {
        badgeClassName:
          speechEngine === "browser"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
            : "border-sky-500/30 bg-sky-500/10 text-sky-700",
        description:
          speechEngine === "browser"
            ? "Browser speech fallback is active."
            : "Live translation is active.",
        label: speechEngine === "browser" ? "Fallback" : "Live",
      };
    case "stopped":
      return {
        badgeClassName: "border-border bg-muted text-muted-foreground",
        description: "Mic session stopped.",
        label: "Stopped",
      };
    case "error":
      return {
        badgeClassName:
          "border-destructive/30 bg-destructive/10 text-destructive",
        description: "Translation hit an error.",
        label: "Error",
      };
    default:
      return {
        badgeClassName: "border-border bg-muted text-muted-foreground",
        description: "Type or speak to start translating.",
        label: "Idle",
      };
  }
}

function getInitialPopupTheme(): PopupTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function buildCaptionDisplayItems(
  lines: LiveCaptionLine[],
  previewText: string
): CaptionDisplayItem[] {
  const trimmedPreview = previewText.trim();

  if (trimmedPreview) {
    return [
      ...lines.slice(-4).map((line) => ({
        id: `line-${line.id}`,
        isActive: false,
        text: line.text,
      })),
      {
        id: `preview-${lines.at(-1)?.id ?? "current"}`,
        isActive: true,
        text: trimmedPreview,
      },
    ];
  }

  if (lines.length === 0) {
    return [];
  }

  const previousLines = lines.slice(0, -1).slice(-4);
  const activeLine = lines.at(-1);

  return [
    ...previousLines.map((line) => ({
      id: `line-${line.id}`,
      isActive: false,
      text: line.text,
    })),
    ...(activeLine
      ? [
          {
            id: `line-${activeLine.id}`,
            isActive: true,
            text: activeLine.text,
          },
        ]
      : []),
  ];
}

async function requestTranslation({
  sourceText,
  targetLanguageCode,
}: {
  sourceText: string;
  targetLanguageCode: string;
}) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mode: "text",
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

function LiveCaptionPopup({
  bodyClassName,
  emptyMessage,
  expanded,
  fullscreen = false,
  lines,
  onClose,
  onToggleFullscreen,
  onThemeToggle,
  theme,
  title,
}: {
  bodyClassName: string;
  emptyMessage: string;
  expanded: boolean;
  fullscreen?: boolean;
  lines: CaptionDisplayItem[];
  onClose: () => void;
  onToggleFullscreen: () => void;
  onThemeToggle: () => void;
  theme: PopupTheme;
  title: string;
}) {
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex min-h-[40vh] overflow-hidden border shadow-2xl transition-[flex-basis,max-width,transform,width,opacity] duration-500 ease-out md:min-h-[68vh]",
        isDark
          ? "border-white/10 bg-zinc-950/88 text-zinc-50 shadow-black/35"
          : "border-black/10 bg-white/88 text-zinc-950 shadow-black/12",
        lines.length === 0 ? "backdrop-blur-xl" : "backdrop-blur-2xl",
        fullscreen
          ? "fixed inset-0 z-[80] min-h-screen w-screen flex-none max-w-none rounded-none border-0"
          : expanded
            ? "w-full flex-[1_1_100%] max-w-none rounded-[28px]"
            : "w-full flex-1 basis-0 rounded-[28px]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_58%),linear-gradient(180deg,rgba(24,24,27,0.95),rgba(9,9,11,0.92))]"
            : "bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.36),_transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,245,0.94))]"
        )}
      />
      <div className="relative flex w-full flex-col">
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-4 py-3",
            isDark ? "border-white/10" : "border-black/10"
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "font-medium text-sm",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}
            >
              {title}
            </p>
            <p
              className={cn(
                "text-xs",
                isDark ? "text-zinc-400" : "text-zinc-500"
              )}
            >
              Live lyric captions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition",
                isDark
                  ? "border-white/12 bg-white/6 text-zinc-200 hover:bg-white/10"
                  : "border-black/10 bg-white/70 text-zinc-700 hover:bg-white"
              )}
              onClick={onToggleFullscreen}
              type="button"
            >
              {fullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span>{fullscreen ? "Exit full" : "Fullscreen"}</span>
            </button>
            <button
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition",
                isDark
                  ? "border-white/12 bg-white/6 text-zinc-200 hover:bg-white/10"
                  : "border-black/10 bg-white/70 text-zinc-700 hover:bg-white"
              )}
              onClick={onThemeToggle}
              type="button"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{isDark ? "Light" : "Dark"}</span>
            </button>
            <button
              className={cn(
                "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition",
                isDark
                  ? "border-white/12 bg-white/6 text-zinc-200 hover:bg-white/10"
                  : "border-black/10 bg-white/70 text-zinc-700 hover:bg-white"
              )}
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "relative flex min-h-[28rem] flex-1 items-center justify-center overflow-hidden px-6 py-6 md:px-8 md:py-10",
            fullscreen ? "min-h-screen px-8 py-10 md:px-16 md:py-16" : ""
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b",
              isDark ? "from-zinc-950 to-transparent" : "from-white to-transparent"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t",
              isDark ? "from-zinc-950 to-transparent" : "from-white to-transparent"
            )}
          />

          {lines.length === 0 ? (
            <div
              className={cn(
                "max-w-md text-center text-base md:text-lg",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}
            >
              {emptyMessage}
            </div>
          ) : (
            <div className="relative h-full w-full">
              {lines.map((line, index) => {
                const distanceFromActive = lines.length - 1 - index;
                const opacity = line.isActive
                  ? 1
                  : Math.max(0.12, 0.82 - distanceFromActive * 0.22);
                const scale = line.isActive
                  ? 1
                  : Math.max(0.84, 0.98 - distanceFromActive * 0.04);
                const offset = distanceFromActive * 74;

                return (
                  <div
                    className="absolute inset-x-0 top-1/2 transition-[transform,opacity,filter] duration-500 ease-out"
                    key={line.id}
                    style={{
                      filter: line.isActive
                        ? "none"
                        : `blur(${Math.min(distanceFromActive * 0.35, 1)}px)`,
                      opacity,
                      transform: `translateY(calc(-50% - ${offset}px)) scale(${scale})`,
                    }}
                  >
                    <p
                      className={cn(
                        "mx-auto max-w-2xl text-center font-medium leading-[1.2] tracking-tight md:text-[2.2rem]",
                        fullscreen ? "max-w-5xl" : "",
                        line.isActive
                          ? fullscreen
                            ? "text-[2.4rem] md:text-[4.4rem]"
                            : "text-[2rem] md:text-[2.8rem]"
                          : fullscreen
                            ? "text-[1.4rem] md:text-[2.3rem]"
                            : "text-[1.25rem] md:text-[1.7rem]",
                        bodyClassName
                      )}
                    >
                      {line.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveSpeechStage({
  fullscreenPopup,
  isSpeechSessionRunning,
  languages,
  onCloseTranscript,
  onCloseTranslation,
  onReopenTranscript,
  onReopenTranslation,
  onStop,
  onTargetLanguageChange,
  onToggleTranscriptFullscreen,
  onToggleTranslationFullscreen,
  onThemeToggle,
  popupTheme,
  showTranscriptPopup,
  showTranslationPopup,
  speechNotice,
  statusMeta,
  targetLanguageCode,
  transcriptItems,
  translationItems,
}: {
  fullscreenPopup: FullscreenPopup;
  isSpeechSessionRunning: boolean;
  languages: TranslateLanguageOption[];
  onCloseTranscript: () => void;
  onCloseTranslation: () => void;
  onReopenTranscript: () => void;
  onReopenTranslation: () => void;
  onStop: () => void;
  onTargetLanguageChange: (value: string) => void;
  onToggleTranscriptFullscreen: () => void;
  onToggleTranslationFullscreen: () => void;
  onThemeToggle: () => void;
  popupTheme: PopupTheme;
  showTranscriptPopup: boolean;
  showTranslationPopup: boolean;
  speechNotice: string | null;
  statusMeta: ReturnType<typeof getStatusMeta>;
  targetLanguageCode: string;
  transcriptItems: CaptionDisplayItem[];
  translationItems: CaptionDisplayItem[];
}) {
  const isDark = popupTheme === "dark";
  const visiblePopupCount = Number(showTranscriptPopup) + Number(showTranslationPopup);
  const singlePanelExpanded = visiblePopupCount === 1;
  const isTranscriptFullscreen = fullscreenPopup === "transcript";
  const isTranslationFullscreen = fullscreenPopup === "translation";

  return (
    <div
      className={cn(
        "relative min-h-[calc(100vh-2rem)] overflow-hidden rounded-[32px] border p-4 md:p-6",
        isDark
          ? "border-white/8 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_44%),linear-gradient(180deg,#09090b,#111827)]"
          : "border-black/8 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.32),_transparent_42%),linear-gradient(180deg,#f8fafc,#eef2ff)]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "bg-[linear-gradient(180deg,transparent,rgba(24,24,27,0.28))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(148,163,184,0.08))]"
        )}
      />
      <div
        className={cn(
          "relative z-10 flex min-h-[calc(100vh-5rem)] flex-col transition-opacity duration-300",
          fullscreenPopup ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                statusMeta.badgeClassName
              )}
              data-testid="translate-speech-engine"
            >
              {statusMeta.label}
            </span>
            <p
              className={cn(
                "max-w-xl text-sm md:text-base",
                isDark ? "text-zinc-300" : "text-zinc-600"
              )}
            >
              {speechNotice ?? statusMeta.description}
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/80 px-3 py-2 shadow-lg backdrop-blur-xl">
            <Waves className="h-4 w-4 text-primary" />
            <Select onValueChange={onTargetLanguageChange} value={targetLanguageCode}>
              <SelectTrigger className="h-auto w-auto cursor-pointer gap-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none focus:ring-0">
                <SelectValue placeholder="Language" />
                <ChevronDown className="h-4 w-4" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="cursor-pointer rounded-full"
              onClick={onStop}
              size="sm"
              type="button"
              variant="destructive"
            >
              {isSpeechSessionRunning ? (
                <MicOff className="mr-2 h-4 w-4" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Stop
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "flex flex-1 items-stretch justify-center gap-4 transition-all duration-500 md:gap-6",
            "mx-auto w-full max-w-7xl",
            visiblePopupCount === 0 ? "items-center" : "items-stretch",
            visiblePopupCount === 2 ? "flex-col md:flex-row" : "flex-col"
          )}
        >
          {showTranscriptPopup ? (
            <LiveCaptionPopup
              bodyClassName={isDark ? "text-zinc-100" : "text-zinc-950"}
              emptyMessage="Waiting for spoken words..."
              expanded={singlePanelExpanded}
              fullscreen={false}
              lines={transcriptItems}
              onClose={onCloseTranscript}
              onToggleFullscreen={onToggleTranscriptFullscreen}
              onThemeToggle={onThemeToggle}
              theme={popupTheme}
              title="Live transcript"
            />
          ) : null}
          {showTranslationPopup ? (
            <LiveCaptionPopup
              bodyClassName={cn(
                isDark ? "text-sky-100" : "text-sky-950",
                "font-semibold"
              )}
              emptyMessage="Waiting for translated captions..."
              expanded={singlePanelExpanded}
              fullscreen={false}
              lines={translationItems}
              onClose={onCloseTranslation}
              onToggleFullscreen={onToggleTranslationFullscreen}
              onThemeToggle={onThemeToggle}
              theme={popupTheme}
              title="Live translation"
            />
          ) : null}

          {visiblePopupCount === 0 ? (
            <div
              className={cn(
                "pointer-events-auto flex max-w-lg flex-col items-center gap-4 rounded-[28px] border px-6 py-8 text-center shadow-xl backdrop-blur-2xl",
                isDark
                  ? "border-white/10 bg-zinc-950/88 text-zinc-100"
                  : "border-black/10 bg-white/92 text-zinc-900"
              )}
            >
              <p className="text-lg font-medium">Caption popups hidden</p>
              <p
                className={cn(
                  "text-sm",
                  isDark ? "text-zinc-400" : "text-zinc-500"
                )}
              >
                Restore the transcript or translation popup while the mic session
                keeps running in the background.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  className="cursor-pointer rounded-full"
                  onClick={onReopenTranscript}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Show transcript
                </Button>
                <Button
                  className="cursor-pointer rounded-full"
                  onClick={onReopenTranslation}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Show translation
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-2">
          {!showTranscriptPopup ? (
            <Button
              className="cursor-pointer rounded-full"
              onClick={onReopenTranscript}
              size="sm"
              type="button"
              variant="outline"
            >
              <Waves className="mr-2 h-4 w-4" />
              Show transcript
            </Button>
          ) : null}
          {!showTranslationPopup ? (
            <Button
              className="cursor-pointer rounded-full"
              onClick={onReopenTranslation}
              size="sm"
              type="button"
              variant="outline"
            >
              <Volume2 className="mr-2 h-4 w-4" />
              Show translation
            </Button>
          ) : null}
        </div>
      </div>

      {isTranscriptFullscreen ? (
        <LiveCaptionPopup
          bodyClassName={isDark ? "text-zinc-100" : "text-zinc-950"}
          emptyMessage="Waiting for spoken words..."
          expanded
          fullscreen
          lines={transcriptItems}
          onClose={onCloseTranscript}
          onToggleFullscreen={onToggleTranscriptFullscreen}
          onThemeToggle={onThemeToggle}
          theme={popupTheme}
          title="Live transcript"
        />
      ) : null}
      {isTranslationFullscreen ? (
        <LiveCaptionPopup
          bodyClassName={cn(
            isDark ? "text-sky-100" : "text-sky-950",
            "font-semibold"
          )}
          emptyMessage="Waiting for translated captions..."
          expanded
          fullscreen
          lines={translationItems}
          onClose={onCloseTranslation}
          onToggleFullscreen={onToggleTranslationFullscreen}
          onThemeToggle={onThemeToggle}
          theme={popupTheme}
          title="Live translation"
        />
      ) : null}
    </div>
  );
}

export function TranslatePageClient({
  initialTargetLanguageCode,
  languages,
  providerMode,
}: TranslatePageClientProps) {
  const [fullscreenPopup, setFullscreenPopup] = useState<FullscreenPopup>(null);
  const [popupTheme, setPopupTheme] = useState<PopupTheme>(() =>
    getInitialPopupTheme()
  );
  const [showTranscriptPopup, setShowTranscriptPopup] = useState(true);
  const [showTranslationPopup, setShowTranslationPopup] = useState(true);
  const [sourceInputMode, setSourceInputMode] =
    useState<SourceInputMode>("typing");
  const [targetLanguageCode, setTargetLanguageCode] = useState(
    initialTargetLanguageCode
  );
  const [typedSourceText, setTypedSourceText] = useState("");
  const [typedTranslatedText, setTypedTranslatedText] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [typingUiState, setTypingUiState] = useState<TranslationUiState>("idle");

  const liveSession = useLiveTranslationSession({
    targetLanguageCode,
  });

  const targetLanguage =
    languages.find((language) => language.code === targetLanguageCode) ??
    languages[0] ??
    null;
  const quickTargetLanguages = languages.slice(0, 3);
  const hasLanguages = languages.length > 0;
  const uiState =
    sourceInputMode === "speech" ? liveSession.phase : typingUiState;
  const sourceText =
    sourceInputMode === "speech"
      ? liveSession.sourcePreview.rawText
      : typedSourceText;
  const translatedText =
    sourceInputMode === "speech"
      ? liveSession.translatedText
      : typedTranslatedText;
  const translationError =
    sourceInputMode === "speech" ? liveSession.error : typedError;
  const statusMeta = getStatusMeta(uiState, liveSession.speechEngine);
  const hasSourceText = sourceText.trim().length > 0;
  const hasTranslatedText = translatedText.trim().length > 0;
  const isSpeechSessionRunning =
    sourceInputMode === "speech" &&
    (uiState === "starting" ||
      uiState === "listening" ||
      uiState === "translating" ||
      uiState === "active");
  const showSpeechBadge =
    sourceInputMode === "speech" ||
    uiState === "stopped" ||
    uiState === "error";
  const transcriptItems = buildCaptionDisplayItems(
    liveSession.transcriptLines,
    liveSession.transcriptPreview
  );
  const translationItems = buildCaptionDisplayItems(
    liveSession.translationLines,
    liveSession.translationPreview
  );

  useEffect(() => {
    if (!targetLanguageCode) {
      return;
    }

    const cookieStore = (
      window as Window & {
        cookieStore?: {
          set: (options: {
            expires: number;
            name: string;
            path: string;
            sameSite: "lax";
            value: string;
          }) => Promise<void>;
        };
      }
    ).cookieStore;

    if (!cookieStore) {
      return;
    }

    void cookieStore.set({
      expires: Date.now() + 31536000 * 1000,
      name: TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      value: encodeURIComponent(targetLanguageCode),
    });
  }, [targetLanguageCode]);

  useEffect(() => {
    if (sourceInputMode !== "speech" || liveSession.sessionId === 0) {
      return;
    }

    setFullscreenPopup(null);
    setPopupTheme(getInitialPopupTheme());
    setShowTranscriptPopup(true);
    setShowTranslationPopup(true);
  }, [liveSession.sessionId, sourceInputMode]);

  useEffect(() => {
    if (sourceInputMode === "speech") {
      return;
    }

    const trimmedSourceText = typedSourceText.trim();
    let cancelled = false;

    if (!trimmedSourceText || !targetLanguageCode) {
      setTypedTranslatedText("");
      setTypingUiState("idle");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTypingUiState("translating");
      setTypedError(null);

      void requestTranslation({
        sourceText: trimmedSourceText,
        targetLanguageCode,
      })
        .then((nextTranslatedText) => {
          if (cancelled) {
            return;
          }

          setTypedTranslatedText(nextTranslatedText);
          setTypingUiState(nextTranslatedText ? "active" : "idle");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Translation could not be completed.";
          setTypedError(message);
          setTypingUiState("error");
          toast({
            type: "error",
            description: message,
          });
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [sourceInputMode, targetLanguageCode, typedSourceText]);

  async function startSpeechCapture() {
    setSourceInputMode("speech");
    setTypedSourceText("");
    setTypedTranslatedText("");
    setTypedError(null);
    setTypingUiState("idle");
    await liveSession.startSession();
  }

  async function stopSpeechCapture() {
    await liveSession.stopSession();
    setFullscreenPopup(null);
    setSourceInputMode("typing");
    setTypedSourceText("");
    setTypedTranslatedText("");
    setTypedError(null);
    setTypingUiState("idle");
  }

  async function clearTranslation() {
    await liveSession.resetSession();
    setFullscreenPopup(null);
    setSourceInputMode("typing");
    setTypedSourceText("");
    setTypedTranslatedText("");
    setTypedError(null);
    setTypingUiState("idle");
  }

  async function copyTranslation() {
    if (!translatedText.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(translatedText);
      toast({
        type: "success",
        description: "Translation copied.",
      });
    } catch {
      toast({
        type: "error",
        description: "Unable to copy the translation.",
      });
    }
  }

  if (sourceInputMode === "speech") {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-4">
        <LiveSpeechStage
          fullscreenPopup={fullscreenPopup}
          isSpeechSessionRunning={isSpeechSessionRunning}
          languages={languages}
          onCloseTranscript={() => {
            setFullscreenPopup((current) =>
              current === "transcript" ? null : current
            );
            setShowTranscriptPopup(false);
          }}
          onCloseTranslation={() => {
            setFullscreenPopup((current) =>
              current === "translation" ? null : current
            );
            setShowTranslationPopup(false);
          }}
          onReopenTranscript={() => {
            setShowTranscriptPopup(true);
          }}
          onReopenTranslation={() => {
            setShowTranslationPopup(true);
          }}
          onStop={() => {
            void stopSpeechCapture();
          }}
          onTargetLanguageChange={setTargetLanguageCode}
          onToggleTranscriptFullscreen={() => {
            setFullscreenPopup((current) =>
              current === "transcript" ? null : "transcript"
            );
          }}
          onToggleTranslationFullscreen={() => {
            setFullscreenPopup((current) =>
              current === "translation" ? null : "translation"
            );
          }}
          onThemeToggle={() => {
            setPopupTheme((current) => (current === "dark" ? "light" : "dark"));
          }}
          popupTheme={popupTheme}
          showTranscriptPopup={showTranscriptPopup}
          showTranslationPopup={showTranslationPopup}
          speechNotice={liveSession.speechNotice}
          statusMeta={statusMeta}
          targetLanguageCode={targetLanguageCode}
          transcriptItems={transcriptItems}
          translationItems={translationItems}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-4">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden rounded-3xl border border-border/70 bg-background shadow-none">
          <CardHeader className="border-b px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                <span className="whitespace-nowrap px-2 py-1 text-muted-foreground text-sm">
                  Source text
                </span>
                <span className="rounded-sm border-b-2 border-primary px-2 py-1 font-medium text-primary text-sm">
                  Typing
                </span>
                {showSpeechBadge ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 font-medium text-[11px]",
                      statusMeta.badgeClassName
                    )}
                    data-testid="translate-speech-engine"
                  >
                    {statusMeta.label}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Button
                  className="h-8 w-8 rounded-full"
                  data-testid="translate-mic-button"
                  disabled={!hasLanguages || uiState === "starting"}
                  onClick={() => {
                    void startSpeechCapture();
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {uiState === "starting" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  className="h-8 w-8 rounded-full"
                  disabled={!hasSourceText && !hasTranslatedText && !translationError}
                  onClick={() => {
                    void clearTranslation();
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[360px] flex-col px-4 py-3">
            <Textarea
              className="min-h-[260px] flex-1 resize-none border-0 bg-transparent px-0 py-0 font-normal text-[20px] leading-[1.45] shadow-none focus-visible:ring-0"
              data-testid="translate-source-textarea"
              id="translate-source"
              onChange={(event) => {
                setTypedSourceText(event.target.value);
                setTypedError(null);
                setTypingUiState(event.target.value.trim() ? "translating" : "idle");
              }}
              placeholder="Type or speak..."
              value={sourceText}
            />
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-xs">
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasLanguages || uiState === "starting"}
                  onClick={() => {
                    void startSpeechCapture();
                  }}
                  type="button"
                >
                  {uiState === "starting" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Start mic</span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span>{sourceText.trim().length}</span>
                <span className="hidden sm:inline">{statusMeta.description}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden rounded-3xl border border-border/70 bg-[#f3f7ff] shadow-none">
          <CardHeader className="border-b bg-background/40 px-4 py-2.5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                {quickTargetLanguages.map((language) => {
                  const isActive = language.code === targetLanguageCode;
                  return (
                    <button
                      className={cn(
                        "cursor-pointer whitespace-nowrap rounded-sm border-b-2 px-2 py-1 text-sm transition-colors",
                        isActive
                          ? "border-primary font-medium text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                      key={language.code}
                      onClick={() => {
                        setTargetLanguageCode(language.code);
                      }}
                      type="button"
                    >
                      {language.name}
                    </button>
                  );
                })}
                <Select
                  disabled={!hasLanguages}
                  onValueChange={setTargetLanguageCode}
                  value={targetLanguageCode}
                >
                  <SelectTrigger className="h-auto w-auto cursor-pointer gap-1 border-0 bg-transparent px-2 py-1 text-muted-foreground text-sm shadow-none focus:ring-0">
                    <SelectValue placeholder="More" />
                    <ChevronDown className="h-4 w-4" />
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
              <div className="flex items-center gap-2 text-muted-foreground">
                {uiState === "translating" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                ) : translatedText.trim().length > 0 ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[360px] flex-col px-4 py-3">
            <div
              className={cn(
                "min-h-[260px] flex-1 whitespace-pre-wrap bg-transparent px-0 py-0 text-[20px] leading-[1.45]",
                hasTranslatedText
                  ? "text-foreground"
                  : "flex items-center justify-center text-center text-muted-foreground text-sm"
              )}
              data-testid="translate-output"
            >
              {hasTranslatedText ? (
                <div className="w-full whitespace-pre-wrap">{translatedText}</div>
              ) : translationError ? (
                <div className="max-w-sm space-y-2">
                  <p className="font-medium text-sm">Translation unavailable</p>
                  <p className="text-muted-foreground text-sm">
                    {translationError}
                  </p>
                </div>
              ) : (
                <div className="max-w-sm space-y-2">
                  <p className="font-medium text-sm">No translation yet</p>
                  <p className="text-muted-foreground text-sm">
                    Type to start translating automatically.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <Button
                  className="h-8 w-8 rounded-full"
                  disabled={!hasTranslatedText}
                  onClick={() => {
                    void copyTranslation();
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  className="h-8 w-8 rounded-full"
                  disabled={!hasSourceText && !hasTranslatedText && !translationError}
                  onClick={() => {
                    void clearTranslation();
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <span className="hidden sm:inline">
                {providerMode === "google"
                  ? "Google Translation API"
                  : targetLanguage?.modelDisplayName ??
                    targetLanguage?.name ??
                    "No target selected"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
