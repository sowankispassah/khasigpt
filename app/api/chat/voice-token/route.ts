import { handleVoiceToken } from "@/lib/voice/voice-token-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleVoiceToken(request, "web"); }
