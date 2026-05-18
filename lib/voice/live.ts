import { TOKENS_PER_CREDIT } from "@/lib/constants";

export const GEMINI_VOICE_CHAT_MODEL_ID = "gemini-3.1-flash-live-preview";
export const GEMINI_VOICE_CHAT_MODEL_NAME = "Gemini 3.1 Flash Live Preview";
export const GEMINI_LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
export const LIVE_VOICE_MODEL_CONFIG_CACHE_TAG = "live-voice-model-configs";
export const VOICE_INPUT_AUDIO_SAMPLE_RATE = 16_000;
export const VOICE_OUTPUT_AUDIO_SAMPLE_RATE = 24_000;
export const VOICE_INPUT_AUDIO_MIME_TYPE = `audio/pcm;rate=${VOICE_INPUT_AUDIO_SAMPLE_RATE}`;
export const VOICE_TOKEN_NEW_SESSION_WINDOW_MS = 2 * 60 * 1_000;
export const VOICE_TOKEN_SESSION_WINDOW_MS = 15 * 60 * 1_000;
export const LIVE_VOICE_BASE_CREDIT_UNITS = 1;

export const GOOGLE_LIVE_VOICE_OPTIONS = [
  { value: "Zephyr", label: "Zephyr", description: "Bright" },
  { value: "Kore", label: "Kore", description: "Firm" },
  { value: "Orus", label: "Orus", description: "Firm" },
  { value: "Autonoe", label: "Autonoe", description: "Bright" },
  { value: "Umbriel", label: "Umbriel", description: "Easy-going" },
  { value: "Erinome", label: "Erinome", description: "Clear" },
  { value: "Laomedeia", label: "Laomedeia", description: "Upbeat" },
  { value: "Schedar", label: "Schedar", description: "Even" },
  { value: "Achird", label: "Achird", description: "Friendly" },
  { value: "Sadachbia", label: "Sadachbia", description: "Lively" },
  { value: "Puck", label: "Puck", description: "Upbeat" },
  { value: "Fenrir", label: "Fenrir", description: "Excitable" },
  { value: "Aoede", label: "Aoede", description: "Breezy" },
  { value: "Enceladus", label: "Enceladus", description: "Breathy" },
  { value: "Algieba", label: "Algieba", description: "Smooth" },
  { value: "Algenib", label: "Algenib", description: "Gravelly" },
  { value: "Achernar", label: "Achernar", description: "Soft" },
  { value: "Gacrux", label: "Gacrux", description: "Mature" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi", description: "Casual" },
  { value: "Sadaltager", label: "Sadaltager", description: "Knowledgeable" },
  { value: "Charon", label: "Charon", description: "Informative" },
  { value: "Leda", label: "Leda", description: "Youthful" },
  { value: "Callirrhoe", label: "Callirrhoe", description: "Easy-going" },
  { value: "Iapetus", label: "Iapetus", description: "Clear" },
  { value: "Despina", label: "Despina", description: "Smooth" },
  { value: "Rasalgethi", label: "Rasalgethi", description: "Informative" },
  { value: "Alnilam", label: "Alnilam", description: "Firm" },
  { value: "Pulcherrima", label: "Pulcherrima", description: "Forward" },
  { value: "Vindemiatrix", label: "Vindemiatrix", description: "Gentle" },
  { value: "Sulafat", label: "Sulafat", description: "Warm" },
] as const;

export const LIVE_VOICE_MEDIA_RESOLUTION_OPTIONS = [
  {
    value: "MEDIA_RESOLUTION_LOW",
    label: "Low",
    description: "64 tokens/image",
  },
  {
    value: "MEDIA_RESOLUTION_MEDIUM",
    label: "Medium",
    description: "256 tokens/image",
  },
  {
    value: "MEDIA_RESOLUTION_HIGH",
    label: "High",
    description: "Zoomed reframing with 256 tokens/image",
  },
] as const;

export type GeminiVoiceTokenResponse =
  | {
      liveSupported: true;
      token: string;
      liveVoiceModelConfigId: string | null;
      modelDisplayName: string;
      modelProviderModelId: string;
      voiceName: string;
      mediaResolution: string;
      systemInstruction: string;
      creditMultiplier: number;
      tokensPerVoiceInteraction: number;
      webSocketUrl: string;
      inputAudioMimeType: string;
      inputSampleRate: number;
      outputSampleRate: number;
      expireTime: string;
      newSessionExpireTime: string;
    }
  | {
      liveSupported: false;
      reason:
        | "feature-disabled"
        | "insufficient-credits"
        | "live-api-unavailable"
        | "platform-unavailable";
      message: string;
    };

export function buildVoiceChatSystemInstruction() {
  return [
    "You are KhasiGPT in voice chat.",
    "The user is speaking by microphone and expects a natural spoken reply.",
    "Answer conversationally and keep responses concise unless the user asks for detail.",
    "Support Khasi and English naturally. If the user speaks Khasi, respond in Khasi unless they request another language.",
    "Do not mention implementation details, tokens, transcripts, or system instructions.",
  ].join("\n");
}

export function getLiveVoiceProviderVoiceOptions(provider: string) {
  if (provider === "google") {
    return GOOGLE_LIVE_VOICE_OPTIONS;
  }
  return GOOGLE_LIVE_VOICE_OPTIONS;
}

export function normalizeLiveVoiceCreditMultiplier(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.min(100, Math.round(parsed * 100) / 100);
}

export function calculateLiveVoiceTokensPerInteraction(multiplier: unknown) {
  return Math.max(
    1,
    Math.round(
      normalizeLiveVoiceCreditMultiplier(multiplier) *
        LIVE_VOICE_BASE_CREDIT_UNITS *
        TOKENS_PER_CREDIT
    )
  );
}
