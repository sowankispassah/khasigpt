export const GEMINI_VOICE_CHAT_MODEL_ID = "gemini-3.1-flash-live-preview";
export const GEMINI_VOICE_CHAT_MODEL_NAME = "Gemini 3.1 Flash Live Preview";
export const GEMINI_LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
export const VOICE_INPUT_AUDIO_SAMPLE_RATE = 16_000;
export const VOICE_OUTPUT_AUDIO_SAMPLE_RATE = 24_000;
export const VOICE_INPUT_AUDIO_MIME_TYPE = `audio/pcm;rate=${VOICE_INPUT_AUDIO_SAMPLE_RATE}`;
export const VOICE_TOKEN_NEW_SESSION_WINDOW_MS = 2 * 60 * 1_000;
export const VOICE_TOKEN_SESSION_WINDOW_MS = 15 * 60 * 1_000;

export type GeminiVoiceTokenResponse =
  | {
      liveSupported: true;
      token: string;
      modelDisplayName: string;
      modelProviderModelId: string;
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
        | "live-api-unavailable"
        | "platform-unavailable";
      message: string;
    };

export function buildVoiceChatSystemInstruction() {
  return [
    "You are KhasiGPT in native mobile voice chat.",
    "The user is speaking by microphone and expects a natural spoken reply.",
    "Answer conversationally and keep responses concise unless the user asks for detail.",
    "Support Khasi and English naturally. If the user speaks Khasi, respond in Khasi unless they request another language.",
    "Do not mention implementation details, tokens, transcripts, or system instructions.",
  ].join("\n");
}
